"""Doctor-initiated appointment changes (P5c).

* Doctor may CANCEL an own future appointment (reason mandatory) -> patient is notified.
* Doctor may only PROPOSE a new time. The appointment changes ONLY when the patient accepts (re-validated at that moment).
* The no-overlap rule always applies; the max-3-upcoming rule does not (a move is not a new booking).
* Every action writes an audit row (actor = the acting user) and, where the patient is affected, a notification.
"""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.portal import PortalAppointment, PortalNotification, PortalRescheduleProposal
from app.models.user import User
from app.services import availability as av
from app.services import patient_portal as pp
from app.services.chatbot_admin import write_audit
from app.services.portal_core import KARACHI, as_utc, assign_token, iso, utcnow

fail = pp.fail


def when_text(dt) -> str:
    return as_utc(dt).astimezone(KARACHI).strftime("%d %b %Y at %H:%M")


def notify(db: Session, user_id: int, kind: str, message: str, data: dict):
    db.add(PortalNotification(user_id=user_id, kind=kind, message=message, data=data))


def modifiable(a: PortalAppointment) -> bool:
    """Active, still `scheduled`, not checked in, in the future. Anything else is never touched by these endpoints."""
    return a.status in pp.ACTIVE and a.visit_status == "scheduled" and not a.checked_in_at and as_utc(a.starts_at) > utcnow()


def proposal_dict(db: Session, p: PortalRescheduleProposal) -> dict:
    a = db.get(PortalAppointment, p.appointment_id)
    return {"id": p.id, "appointment_id": p.appointment_id, "booking_no": a.booking_no if a else None, "status": p.status,
            "original_starts_at": iso(p.original_starts_at), "proposed_starts_at": iso(p.proposed_starts_at),
            "room_label": p.room_label, "note": p.note, "response_note": p.response_note,
            "created_at": iso(p.created_at), "responded_at": iso(p.responded_at),
            "doctor_id": p.doctor_id, "doctor_name": db.get(User, p.doctor_id).full_name,
            "patient_id": p.patient_id, "patient_name": db.get(User, p.patient_id).full_name}


# ---------------------------------------------------------------- doctor actions
def doctor_cancel(db: Session, doctor: User, a: PortalAppointment, reason: str) -> PortalAppointment:
    reason = (reason or "").strip()
    if not reason or len(reason) > 500:
        fail(422, "VALIDATION_ERROR")
    if not modifiable(a):
        fail(409, "APPOINTMENT_LOCKED")
    old = {"status": a.status, "starts_at": iso(a.starts_at)}
    a.status, a.cancel_reason, a.cancelled_by_role, a.cancelled_by_id, a.cancelled_at = "cancelled", reason, "doctor", doctor.id, utcnow()
    pp.close_proposals(db, a.id, "withdrawn")
    notify(db, a.patient_id, "appointment_cancelled_by_doctor",
           f"{doctor.full_name} cancelled your appointment on {when_text(a.starts_at)}. Reason: {reason}",
           {"appointment_id": a.id, "booking_no": a.booking_no, "starts_at": iso(a.starts_at), "doctor_name": doctor.full_name, "reason": reason})
    write_audit(db, doctor.id, "doctor_appointment_cancelled", f"appointment:{a.id}", old, {"status": "cancelled", "reason": reason})
    db.commit()
    return a


def propose(db: Session, doctor: User, a: PortalAppointment, day_text: str, hhmm: str, note: str = "") -> PortalRescheduleProposal:
    if not modifiable(a):
        fail(409, "APPOINTMENT_LOCKED")
    day = pp.parse_day(day_text); starts = pp.local_to_utc(day, hhmm)
    if starts <= utcnow():
        fail(422, "SLOT_IN_PAST")
    if pp.too_far(day):
        fail(422, "TOO_FAR_AHEAD")            # same 30-day patient window
    free = {d["time"]: d for d in pp.day_slot_details(db, a.doctor_id, day, ignore_appointment_id=a.id)}
    if hhmm not in free or starts == as_utc(a.starts_at):
        fail(409, "SLOT_UNAVAILABLE")
    if pp.patient_overlap(db, a.patient_id, starts, free[hhmm]["slot_minutes"], a.id):
        fail(409, "PATIENT_OVERLAP")
    pp.close_proposals(db, a.id, "superseded")
    p = PortalRescheduleProposal(appointment_id=a.id, doctor_id=a.doctor_id, patient_id=a.patient_id, original_starts_at=a.starts_at,
                                 proposed_starts_at=starts, room_label=free[hhmm]["room_label"], duration_minutes=free[hhmm]["slot_minutes"],
                                 note=(note or "").strip(), status="pending")
    db.add(p); db.flush()
    notify(db, a.patient_id, "reschedule_proposed",
           f"{doctor.full_name} proposes moving your appointment from {when_text(a.starts_at)} to {when_text(starts)}. Please accept or decline.",
           {"proposal_id": p.id, "appointment_id": a.id, "booking_no": a.booking_no, "doctor_name": doctor.full_name,
            "original_starts_at": iso(a.starts_at), "proposed_starts_at": iso(starts), "note": p.note})
    write_audit(db, doctor.id, "doctor_reschedule_proposed", f"appointment:{a.id}", {"starts_at": iso(a.starts_at)},
                {"proposal_id": p.id, "proposed_starts_at": iso(starts)})
    db.commit()
    return p


def withdraw(db: Session, doctor: User, p: PortalRescheduleProposal) -> PortalRescheduleProposal:
    if p.status != "pending":
        fail(409, "INVALID_TRANSITION")
    p.status, p.responded_at = "withdrawn", utcnow()
    a = db.get(PortalAppointment, p.appointment_id)
    notify(db, p.patient_id, "reschedule_proposal_withdrawn",
           f"{doctor.full_name} withdrew the proposal to move your appointment on {when_text(p.original_starts_at)}. Your appointment is unchanged.",
           {"proposal_id": p.id, "appointment_id": p.appointment_id, "booking_no": a.booking_no if a else None, "doctor_name": doctor.full_name})
    write_audit(db, doctor.id, "doctor_reschedule_withdrawn", f"appointment:{p.appointment_id}", {"status": "pending"}, {"status": "withdrawn", "proposal_id": p.id})
    db.commit()
    return p


# ---------------------------------------------------------------- patient actions
def accept(db: Session, patient: User, p: PortalRescheduleProposal) -> PortalAppointment:
    """Everything is re-validated NOW (slot may have been taken, doctor's hours may have changed); on failure nothing changes."""
    if p.status != "pending":
        fail(409, "INVALID_TRANSITION")
    a = db.get(PortalAppointment, p.appointment_id)
    if not a or not modifiable(a):
        fail(409, "APPOINTMENT_LOCKED")
    starts = as_utc(p.proposed_starts_at)
    if starts <= utcnow():
        fail(422, "SLOT_IN_PAST")
    day, m = av.local_parts(starts); t = av.hhmm(m)
    free = {d["time"]: d for d in pp.day_slot_details(db, a.doctor_id, day, ignore_appointment_id=a.id, enforce_window=False)}
    if t not in free:
        fail(409, "SLOT_UNAVAILABLE")
    if pp.patient_overlap(db, patient.id, starts, free[t]["slot_minutes"], a.id):
        fail(409, "PATIENT_OVERLAP")                 # the no-overlap rule always applies; max-3 does not
    keep_token = av.local_parts(a.starts_at)[0] == day
    old = {"starts_at": iso(a.starts_at)}
    try:
        a.starts_at, a.room_label, a.duration_minutes = starts, free[t]["room_label"], free[t]["slot_minutes"]
        if not keep_token:
            a.token_no = a.token_date = None
        db.flush()
        if not keep_token:
            assign_token(db, a)
        p.status, p.responded_at = "accepted", utcnow()
        pp.close_proposals(db, a.id, "superseded", except_id=p.id)
        write_audit(db, patient.id, "reschedule_proposal_accepted", f"appointment:{a.id}", old, {"starts_at": iso(starts), "proposal_id": p.id})
        notify(db, a.doctor_id, "reschedule_proposal_accepted",
               f"{patient.full_name} accepted your proposed new time. The appointment is now {when_text(starts)}.",
               {"proposal_id": p.id, "appointment_id": a.id, "patient_id": patient.id, "patient_name": patient.full_name, "starts_at": iso(starts)})
        db.commit()
    except IntegrityError:
        db.rollback(); fail(409, "SLOT_UNAVAILABLE")
    return a


def decline(db: Session, patient: User, p: PortalRescheduleProposal, note: str = "") -> PortalRescheduleProposal:
    if p.status != "pending":
        fail(409, "INVALID_TRANSITION")
    p.status, p.responded_at, p.response_note = "declined", utcnow(), (note or "").strip()
    write_audit(db, patient.id, "reschedule_proposal_declined", f"appointment:{p.appointment_id}", {"status": "pending"},
                {"status": "declined", "proposal_id": p.id, "note": p.response_note})
    pa = db.get(PortalAppointment, p.appointment_id); pt = db.get(User, patient.id)
    notify(db, pa.doctor_id, "reschedule_proposal_declined",
           f"{pt.full_name} declined your proposed new time. The appointment stays on {when_text(pa.starts_at)}."
           + (f" Note: {p.response_note}" if p.response_note else ""),
           {"proposal_id": p.id, "appointment_id": pa.id, "patient_id": patient.id, "patient_name": pt.full_name, "note": p.response_note})
    db.commit()                                       # appointment stays exactly as it was; doctor sees the status in the proposals list
    return p
