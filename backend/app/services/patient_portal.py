"""Patient portal business logic: bookable doctors, free slots, booking / rescheduling."""
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.admin import AdminDepartment, AdminStaffProfile
from app.models.portal import (PortalAppointment, PortalDoctorSchedule, PortalHospitalSettings, PortalLabReport,
                               PortalNotification, PortalRescheduleProposal, PortalScheduleException)
from app.services import availability as av
from app.models.user import User
from app.services.portal_core import KARACHI, as_utc, assign_token, local_day, utcnow

ACTIVE = ("pending", "confirmed")
MAX_ADVANCE_DAYS = 30        # booking window (hospital-local calendar days from today)
MAX_UPCOMING_ACTIVE = 3      # per patient (pending + confirmed, not yet started)
# CHANGED: patients may edit / cancel at ANY time before check-in (the old 2-hour cutoff was removed).
DEFAULT_SLOT_MINUTES = 30    # visit length when no schedule row exists for that weekday


def fail(status: int, code: str):
    raise HTTPException(status_code=status, detail=code)


def department_of(db: Session, doctor_id: int):
    staff = db.get(AdminStaffProfile, doctor_id)
    return db.get(AdminDepartment, staff.department_id) if staff and staff.department_id else None


def bookable_doctors(db: Session, department_id: int | None = None):
    """Active doctors with a department and at least one active schedule day."""
    scheduled = set(db.scalars(select(PortalDoctorSchedule.doctor_id).where(PortalDoctorSchedule.is_active.is_(True))).all())
    scheduled |= set(db.scalars(select(PortalScheduleException.doctor_id).where(      # doctors who only have extra/custom dates
        PortalScheduleException.day >= datetime.now(KARACHI).date(), PortalScheduleException.kind != "leave")).all())
    out = []
    for u in db.scalars(select(User).where(User.role == "doctor", User.is_active.is_(True)).order_by(User.full_name)).all():
        dep = department_of(db, u.id)
        if u.id in scheduled and dep and (department_id is None or dep.id == department_id):
            staff = db.get(AdminStaffProfile, u.id)
            out.append({"id": u.id, "full_name": u.full_name, "department_id": dep.id, "department": dep.name, "specialty": staff.specialty or ""})
    return out


def parse_day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        fail(422, "VALIDATION_ERROR")


def local_to_utc(day: date, hhmm: str) -> datetime:
    try:
        h, m = hhmm.split(":"); t = time(int(h), int(m))
    except (ValueError, AttributeError):
        fail(422, "VALIDATION_ERROR")
    return datetime.combine(day, t, tzinfo=KARACHI).astimezone(timezone.utc)


def too_far(day: date) -> bool:
    return day > datetime.now(KARACHI).date() + timedelta(days=MAX_ADVANCE_DAYS)


def visit_minutes(db: Session, doctor_id: int, starts_at: datetime) -> int:
    """Length of a NEW visit starting at `starts_at` = slot size of the session it falls in (template + exceptions)."""
    d, m = av.local_parts(starts_at)
    sess = av.load(db, doctor_id).session_at(d, m)
    return sess["slot_minutes"] if sess else DEFAULT_SLOT_MINUTES


def patient_overlap(db: Session, patient_id: int, starts: datetime, minutes: int, ignore_appointment_id: int | None = None) -> bool:
    """True if [starts, starts+minutes) overlaps any other active appointment of this patient (any doctor)."""
    end = starts + timedelta(minutes=minutes)
    for o in db.scalars(select(PortalAppointment).where(
            PortalAppointment.patient_id == patient_id, PortalAppointment.status.in_(ACTIVE),
            PortalAppointment.id != (ignore_appointment_id or -1))).all():
        o_start = as_utc(o.starts_at)
        if starts < o_start + timedelta(minutes=av.appointment_minutes(av.load(db, o.doctor_id), o)) and o_start < end:
            return True
    return False


def day_slot_details(db: Session, doctor_id: int, day: date, ignore_appointment_id: int | None = None,
                     patient_id: int | None = None, enforce_window: bool = True) -> list[dict]:
    """Free slots [{time, slot_minutes, room_label}] for a doctor on a date (hospital local).
    Built from template + exceptions (sessions, breaks); a slot is hidden if it is in the past, overlaps ANY existing
    active appointment of the doctor (real intervals), is beyond the booking window, or overlaps the patient's own bookings."""
    if enforce_window and too_far(day):
        return []
    avail = av.load(db, doctor_id)
    grid = avail.grid(day)
    if not grid:
        return []
    lo = datetime.combine(day, time(0, 0), tzinfo=KARACHI).astimezone(timezone.utc)
    hi = lo + timedelta(days=1)
    busy = []
    for a in db.scalars(select(PortalAppointment).where(
            PortalAppointment.doctor_id == doctor_id, PortalAppointment.status.in_(ACTIVE),
            PortalAppointment.starts_at >= lo - timedelta(hours=3), PortalAppointment.starts_at < hi,
            PortalAppointment.id != (ignore_appointment_id or -1))).all():
        st = as_utc(a.starts_at); busy.append((st, st + timedelta(minutes=av.appointment_minutes(avail, a))))
    now, out = utcnow(), []
    for g in grid:
        cur = datetime.combine(day, time(int(g["time"][:2]), int(g["time"][3:])), tzinfo=KARACHI).astimezone(timezone.utc)
        end = cur + timedelta(minutes=g["slot_minutes"])
        if cur <= now or any(cur < b_end and b_start < end for b_start, b_end in busy):
            continue
        if patient_id and patient_overlap(db, patient_id, cur, g["slot_minutes"], ignore_appointment_id):
            continue
        out.append(g)
    return out


def day_slots(db: Session, doctor_id: int, day: date, ignore_appointment_id: int | None = None, patient_id: int | None = None):
    """Backward-compatible wrapper: (["HH:MM", ...], room_label of the first free slot or '')."""
    det = day_slot_details(db, doctor_id, day, ignore_appointment_id, patient_id)
    return [d["time"] for d in det], (det[0]["room_label"] if det else "")


def _require_bookable(db: Session, doctor_id: int) -> User:
    doc = db.get(User, doctor_id)
    if not doc or doc.role != "doctor" or not doc.is_active or not any(d["id"] == doctor_id for d in bookable_doctors(db)):
        fail(404, "NOT_FOUND")
    return doc


def validate_slot(db: Session, patient: User, doctor_id: int, day_text: str, hhmm: str, ignore_appointment_id: int | None = None):
    """Run every booking rule WITHOUT writing anything. Returns (starts_utc, room_label)."""
    _require_bookable(db, doctor_id)
    day = parse_day(day_text); starts = local_to_utc(day, hhmm)
    if starts <= utcnow():
        fail(422, "SLOT_IN_PAST")
    if too_far(day):
        fail(422, "TOO_FAR_AHEAD")
    free = {d["time"]: d for d in day_slot_details(db, doctor_id, day, ignore_appointment_id)}   # ignoring the patient's own clashes
    if hhmm not in free:
        fail(409, "SLOT_UNAVAILABLE")
    room = free[hhmm]["room_label"]
    if patient_overlap(db, patient.id, starts, visit_minutes(db, doctor_id, starts), ignore_appointment_id):
        fail(409, "PATIENT_OVERLAP")
    return starts, room


def upcoming_active_count(db: Session, patient_id: int) -> int:
    now = utcnow()
    return sum(1 for a in db.scalars(select(PortalAppointment).where(
        PortalAppointment.patient_id == patient_id, PortalAppointment.status.in_(ACTIVE))).all() if as_utc(a.starts_at) > now)


def book(db: Session, patient: User, doctor_id: int, day_text: str, hhmm: str, extra: dict | None = None, before_commit=None) -> PortalAppointment:
    """`extra` = additional appointment columns (follow-up fields); `before_commit(a)` runs in the same transaction
    (used to close a follow-up recommendation atomically with the booking)."""
    starts, room = validate_slot(db, patient, doctor_id, day_text, hhmm)
    if upcoming_active_count(db, patient.id) >= MAX_UPCOMING_ACTIVE:
        fail(409, "BOOKING_LIMIT_REACHED")
    for _ in range(3):  # retry on token collisions between concurrent bookings
        a = PortalAppointment(patient_id=patient.id, doctor_id=doctor_id, starts_at=starts, status="confirmed",
                              visit_status="scheduled", room_label=room,
                              duration_minutes=visit_minutes(db, doctor_id, starts), **{"source": "portal", **(extra or {})})
        db.add(a)
        try:
            db.flush(); a.booking_no = f"APT-{a.id:04d}"; assign_token(db, a)
            if before_commit:
                before_commit(a)
            db.commit(); return a
        except IntegrityError:
            db.rollback()
            if any(x.starts_at and as_utc(x.starts_at) == starts for x in db.scalars(select(PortalAppointment).where(
                    PortalAppointment.doctor_id == doctor_id, PortalAppointment.status.in_(ACTIVE))).all()):
                fail(409, "SLOT_UNAVAILABLE")
    fail(409, "SLOT_UNAVAILABLE")


def close_proposals(db: Session, appointment_id: int, status: str, except_id: int | None = None):
    """Close every still-pending doctor proposal for an appointment (it was cancelled / moved / superseded)."""
    for p in db.scalars(select(PortalRescheduleProposal).where(
            PortalRescheduleProposal.appointment_id == appointment_id, PortalRescheduleProposal.status == "pending",
            PortalRescheduleProposal.id != (except_id or -1))).all():
        p.status, p.responded_at = status, utcnow()


def editable(a: PortalAppointment) -> bool:
    """Patient may change/cancel any active, still-scheduled visit that has not been checked in.
    There is no time cutoff any more; once the patient is checked in / in progress / done it is locked."""
    return a.status in ACTIVE and a.visit_status == "scheduled" and not a.checked_in_at


def _tell_doctor(db: Session, doctor_id: int, patient: User, a: PortalAppointment, kind: str, message: str):
    """In-app notification for the doctor when the PATIENT changes an appointment (written in the caller's transaction)."""
    db.add(PortalNotification(user_id=doctor_id, kind=kind, message=message,
                              data={"appointment_id": a.id, "patient_id": patient.id, "patient_name": patient.full_name}))


def _when(dt) -> str:
    return as_utc(dt).astimezone(KARACHI).strftime("%d %b %Y at %H:%M")


def reschedule(db: Session, a: PortalAppointment, doctor_id: int | None, day_text: str, hhmm: str) -> PortalAppointment:
    """All rules are checked before anything is changed; on any failure the original appointment is untouched."""
    if not editable(a):
        fail(409, "APPOINTMENT_LOCKED")
    patient = db.get(User, a.patient_id)
    new_doctor = doctor_id or a.doctor_id
    starts, room = validate_slot(db, patient, new_doctor, day_text, hhmm, ignore_appointment_id=a.id)
    keep_token = new_doctor == a.doctor_id and local_day(a.starts_at) == parse_day(day_text)
    old_doctor, old_start = a.doctor_id, a.starts_at
    try:
        a.doctor_id, a.starts_at, a.room_label = new_doctor, starts, room
        a.duration_minutes = visit_minutes(db, new_doctor, starts)
        close_proposals(db, a.id, "withdrawn")
        if not keep_token:
            a.token_no = a.token_date = None
        db.flush()
        if not keep_token:
            assign_token(db, a)
        if new_doctor == old_doctor:
            _tell_doctor(db, old_doctor, patient, a, "appointment_rescheduled_by_patient",
                         f"{patient.full_name} moved their appointment from {_when(old_start)} to {_when(starts)}.")
        else:
            _tell_doctor(db, old_doctor, patient, a, "appointment_moved_away_by_patient",
                         f"{patient.full_name} moved their appointment of {_when(old_start)} to another doctor.")
            _tell_doctor(db, new_doctor, patient, a, "appointment_rescheduled_by_patient",
                         f"{patient.full_name} rescheduled an appointment to you on {_when(starts)}.")
        db.commit()
    except IntegrityError:
        db.rollback(); fail(409, "SLOT_UNAVAILABLE")
    return a


def cancel(db: Session, a: PortalAppointment) -> PortalAppointment:
    if not editable(a):
        fail(409, "APPOINTMENT_LOCKED")
    a.status = "cancelled"; close_proposals(db, a.id, "withdrawn")
    patient = db.get(User, a.patient_id)
    _tell_doctor(db, a.doctor_id, patient, a, "appointment_cancelled_by_patient",
                 f"{patient.full_name} cancelled the appointment on {_when(a.starts_at)}.")
    db.commit(); return a


# ---------- lab booking rules ----------
LAB_ACTIVE = ("requested", "scheduled", "in_progress")


def lab_hours(db: Session):
    """(opens, closes) as "HH:MM" for lab bookings, or None when open 24 hours.
    Lab override columns win when set; otherwise the Hospital Profile hours apply."""
    h = db.get(PortalHospitalSettings, 1)
    if h is None:
        return None
    if h.lab_opens_at and h.lab_closes_at:
        return h.lab_opens_at, h.lab_closes_at
    if h.open_24h is False and h.opens_at and h.closes_at:
        return h.opens_at, h.closes_at
    return None


def validate_lab_booking(db: Session, patient: User, test_id: int, day_text: str, hhmm: str) -> datetime:
    """Every lab-booking rule, without writing. Returns the UTC start time."""
    day = parse_day(day_text); when = local_to_utc(day, hhmm)
    if when <= utcnow():
        fail(422, "SLOT_IN_PAST")
    if too_far(day):
        fail(422, "TOO_FAR_AHEAD")
    hours = lab_hours(db)
    if hours and not (hours[0] <= hhmm < hours[1]):
        fail(422, "OUTSIDE_HOURS")
    if db.scalar(select(PortalLabReport.id).where(PortalLabReport.patient_id == patient.id, PortalLabReport.test_id == test_id,
                                                  PortalLabReport.status.in_(LAB_ACTIVE)).limit(1)):
        fail(409, "DUPLICATE_ACTIVE_REQUEST")
    return when
