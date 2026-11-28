"""Follow-up appointments (P5d).

* Doctor RECOMMENDS an exact date+time linked to an earlier visit of the same doctor and patient. It is NOT an appointment
  until the patient accepts. One pending recommendation per source visit (a new one supersedes the old); the doctor may withdraw.
* Patient ACCEPTS the exact slot, or picks ANOTHER free slot of the same doctor. Every booking rule is re-validated at that
  moment (30-day window, max 3 upcoming, no overlap, slot free). If the slot is gone -> 409 SLOT_UNAVAILABLE, nothing is
  created and the recommendation stays pending so the patient can choose another slot.
* Doctor may DIRECT-SCHEDULE a confirmed follow-up only when he records that the patient agreed (doctor, consent flag,
  consent time and creation time are stored). The same booking rules apply.
* Patients may self-book a follow-up (flagged, optional link to their own earlier visit).
* Recommendations whose proposed time has passed become `expired` (applied lazily on every read/act).
* Patient AND doctor get in-app notifications; every action writes an audit row (actor = acting user).
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.portal import PortalAppointment, PortalFollowupRecommendation
from app.models.user import User
from app.services import availability as av
from app.services import patient_portal as pp
from app.services.appointment_changes import notify, when_text
from app.services.chatbot_admin import write_audit
from app.services.portal_core import as_utc, iso, utcnow

fail = pp.fail
LINKABLE = ("confirmed", "completed")       # a visit that really exists / happened (not pending, cancelled, rejected)


def rec_dict(db: Session, r: PortalFollowupRecommendation) -> dict:
    src = db.get(PortalAppointment, r.source_appointment_id)
    res = db.get(PortalAppointment, r.resulting_appointment_id) if r.resulting_appointment_id else None
    return {"id": r.id, "source_appointment_id": r.source_appointment_id, "source_booking_no": src.booking_no if src else None,
            "status": r.status, "proposed_starts_at": iso(r.proposed_starts_at), "room_label": r.room_label, "note": r.note,
            "response_note": r.response_note, "created_at": iso(r.created_at), "responded_at": iso(r.responded_at),
            "appointment_id": r.resulting_appointment_id, "appointment_starts_at": iso(res.starts_at) if res else None,
            "doctor_id": r.doctor_id, "doctor_name": db.get(User, r.doctor_id).full_name,
            "patient_id": r.patient_id, "patient_name": db.get(User, r.patient_id).full_name}


def expire_due(db: Session):
    """pending -> expired once the recommended time has passed."""
    now, changed = utcnow(), False
    for r in db.scalars(select(PortalFollowupRecommendation).where(PortalFollowupRecommendation.status == "pending")).all():
        if as_utc(r.proposed_starts_at) <= now:
            r.status = "expired"; changed = True
    if changed:
        db.commit()


# ---------------------------------------------------------------- doctor
def _own_source(db: Session, doctor: User, source: PortalAppointment, starts) -> User:
    """The earlier visit must be this doctor's, with a real status, and start before the follow-up."""
    if source.doctor_id != doctor.id:
        fail(404, "NOT_FOUND")
    if source.status not in LINKABLE or as_utc(source.starts_at) >= starts:
        fail(422, "VALIDATION_ERROR")
    return db.get(User, source.patient_id)


def recommend(db: Session, doctor: User, source: PortalAppointment, day_text: str, hhmm: str, note: str = "") -> PortalFollowupRecommendation:
    note = (note or "").strip()
    if len(note) > 300:
        fail(422, "VALIDATION_ERROR")
    day = pp.parse_day(day_text); starts = pp.local_to_utc(day, hhmm)
    patient = _own_source(db, doctor, source, starts)
    _, room = pp.validate_slot(db, patient, doctor.id, day_text, hhmm)           # in future, <=30 days, free, no patient overlap
    for old in db.scalars(select(PortalFollowupRecommendation).where(
            PortalFollowupRecommendation.source_appointment_id == source.id, PortalFollowupRecommendation.status == "pending")).all():
        old.status, old.responded_at = "superseded", utcnow()
    r = PortalFollowupRecommendation(source_appointment_id=source.id, doctor_id=doctor.id, patient_id=patient.id, proposed_starts_at=starts,
                                     room_label=room, duration_minutes=pp.visit_minutes(db, doctor.id, starts), note=note, status="pending")
    db.add(r); db.flush()
    notify(db, patient.id, "followup_recommended",
           f"{doctor.full_name} recommends a follow-up visit on {when_text(starts)}. Please accept it or choose another time.",
           {"recommendation_id": r.id, "source_appointment_id": source.id, "booking_no": source.booking_no,
            "doctor_name": doctor.full_name, "proposed_starts_at": iso(starts), "note": r.note})
    write_audit(db, doctor.id, "doctor_followup_recommended", f"appointment:{source.id}", {}, {"recommendation_id": r.id, "proposed_starts_at": iso(starts)})
    db.commit()
    return r


def withdraw(db: Session, doctor: User, r: PortalFollowupRecommendation) -> PortalFollowupRecommendation:
    expire_due(db); db.refresh(r)
    if r.status != "pending":
        fail(409, "INVALID_TRANSITION")
    r.status, r.responded_at = "withdrawn", utcnow()
    notify(db, r.patient_id, "followup_recommendation_withdrawn",
           f"{doctor.full_name} withdrew the follow-up recommendation for {when_text(r.proposed_starts_at)}.",
           {"recommendation_id": r.id, "source_appointment_id": r.source_appointment_id, "doctor_name": doctor.full_name})
    write_audit(db, doctor.id, "doctor_followup_withdrawn", f"appointment:{r.source_appointment_id}", {"status": "pending"}, {"status": "withdrawn", "recommendation_id": r.id})
    db.commit()
    return r


def schedule_directly(db: Session, doctor: User, source: PortalAppointment, day_text: str, hhmm: str, patient_agreed: bool) -> PortalAppointment:
    if patient_agreed is not True:
        fail(422, "VALIDATION_ERROR")                                            # consent must be recorded
    day = pp.parse_day(day_text); starts = pp.local_to_utc(day, hhmm)
    patient = _own_source(db, doctor, source, starts)
    now = utcnow()

    def finish(a: PortalAppointment):
        notify(db, patient.id, "followup_scheduled_by_doctor",
               f"{doctor.full_name} scheduled your follow-up visit on {when_text(a.starts_at)} (you agreed to this).",
               {"appointment_id": a.id, "booking_no": a.booking_no, "source_appointment_id": source.id,
                "doctor_name": doctor.full_name, "starts_at": iso(a.starts_at)})
        write_audit(db, doctor.id, "doctor_followup_scheduled", f"appointment:{a.id}", {},
                    {"source_appointment_id": source.id, "starts_at": iso(a.starts_at), "patient_agreed": True})

    return pp.book(db, patient, doctor.id, day_text, hhmm, before_commit=finish, extra={
        "source": "doctor_followup", "reason": "Follow-up", "is_followup": True, "followup_of_appointment_id": source.id,
        "created_by_doctor_id": doctor.id, "patient_agreed": True, "agreed_at": now})


# ---------------------------------------------------------------- patient
def accept(db: Session, patient: User, r: PortalFollowupRecommendation, day_text: str | None = None, hhmm: str | None = None) -> PortalAppointment:
    expire_due(db); db.refresh(r)
    if r.status != "pending":
        fail(409, "INVALID_TRANSITION")
    if (day_text is None) != (hhmm is None):
        fail(422, "VALIDATION_ERROR")
    chose_other = day_text is not None
    if not chose_other:
        d, m = av.local_parts(as_utc(r.proposed_starts_at)); day_text, hhmm = d.isoformat(), av.hhmm(m)
    doctor = db.get(User, r.doctor_id)

    def finish(a: PortalAppointment):
        r.status, r.responded_at, r.resulting_appointment_id = "accepted", utcnow(), a.id
        notify(db, doctor.id, "followup_recommendation_accepted",
               f"{patient.full_name} accepted the follow-up recommendation and booked {when_text(a.starts_at)}"
               + (" (a different time than recommended)." if chose_other else "."),
               {"recommendation_id": r.id, "appointment_id": a.id, "source_appointment_id": r.source_appointment_id,
                "patient_id": patient.id, "patient_name": patient.full_name, "starts_at": iso(a.starts_at), "chose_other_slot": chose_other})
        write_audit(db, patient.id, "followup_recommendation_accepted", f"appointment:{r.source_appointment_id}", {"status": "pending"},
                    {"status": "accepted", "recommendation_id": r.id, "appointment_id": a.id, "starts_at": iso(a.starts_at), "chose_other_slot": chose_other})

    # all booking rules re-validated now; any failure raises before anything is written and the recommendation stays pending
    return pp.book(db, patient, r.doctor_id, day_text, hhmm, before_commit=finish, extra={
        "reason": "Follow-up", "is_followup": True, "followup_of_appointment_id": r.source_appointment_id})


def decline(db: Session, patient: User, r: PortalFollowupRecommendation, note: str = "") -> PortalFollowupRecommendation:
    expire_due(db); db.refresh(r)
    if r.status != "pending":
        fail(409, "INVALID_TRANSITION")
    r.status, r.responded_at, r.response_note = "declined", utcnow(), (note or "").strip()
    notify(db, r.doctor_id, "followup_recommendation_declined",
           f"{patient.full_name} declined the follow-up recommendation for {when_text(r.proposed_starts_at)}."
           + (f" Note: {r.response_note}" if r.response_note else ""),
           {"recommendation_id": r.id, "source_appointment_id": r.source_appointment_id, "patient_id": patient.id,
            "patient_name": patient.full_name, "note": r.response_note})
    write_audit(db, patient.id, "followup_recommendation_declined", f"appointment:{r.source_appointment_id}", {"status": "pending"},
                {"status": "declined", "recommendation_id": r.id, "note": r.response_note})
    db.commit()
    return r


def self_book(db: Session, patient: User, doctor_id: int, day_text: str, hhmm: str, of_appointment_id: int | None) -> PortalAppointment:
    """Patient books a follow-up on their own: normal booking rules, flagged, optional link to their own earlier visit."""
    if of_appointment_id is not None:
        src = db.get(PortalAppointment, of_appointment_id)
        if not src or src.patient_id != patient.id:
            fail(404, "NOT_FOUND")
        if src.status not in LINKABLE or as_utc(src.starts_at) >= pp.local_to_utc(pp.parse_day(day_text), hhmm):
            fail(422, "VALIDATION_ERROR")
    return pp.book(db, patient, doctor_id, day_text, hhmm, extra={"is_followup": True, "followup_of_appointment_id": of_appointment_id})


# ---------------------------------------------------------------- history (patient profile)
def history(db: Session, patient_id: int) -> list[dict]:
    """Complete follow-up history of one patient: recommendations (never shown as bookings) plus follow-up appointments that did
    NOT come from a recommendation (doctor-scheduled or patient-booked). Newest first."""
    expire_due(db)

    def visit(a_id):
        a = db.get(PortalAppointment, a_id) if a_id else None
        return {"booking_no": a.booking_no, "starts_at": iso(a.starts_at)} if a else {"booking_no": None, "starts_at": None}

    rows, linked = [], set()
    for r in db.scalars(select(PortalFollowupRecommendation).where(PortalFollowupRecommendation.patient_id == patient_id)).all():
        res = db.get(PortalAppointment, r.resulting_appointment_id) if r.resulting_appointment_id else None
        if res:
            linked.add(res.id)
        src = visit(r.source_appointment_id)
        rows.append({"kind": "recommendation", "id": r.id, "doctor_name": db.get(User, r.doctor_id).full_name, "booking_source": "doctor_recommended",
                     "source_appointment_id": r.source_appointment_id, "source_booking_no": src["booking_no"], "source_starts_at": src["starts_at"],
                     "created_at": iso(r.created_at), "suggested_starts_at": iso(r.proposed_starts_at), "status": r.status,
                     "appointment_id": res.id if res else None, "appointment_starts_at": iso(res.starts_at) if res else None,
                     "appointment_status": res.status if res else None, "note": r.note})
    q = select(PortalAppointment).where(PortalAppointment.patient_id == patient_id, PortalAppointment.is_followup.is_(True))
    for a in db.scalars(q).all():
        if a.id in linked:
            continue
        src = visit(a.followup_of_appointment_id)
        by_doctor = a.source == "doctor_followup"
        rows.append({"kind": "appointment", "id": a.id, "doctor_name": db.get(User, a.doctor_id).full_name,
                     "booking_source": "doctor_scheduled" if by_doctor else "patient_booked",
                     "source_appointment_id": a.followup_of_appointment_id, "source_booking_no": src["booking_no"], "source_starts_at": src["starts_at"],
                     "created_at": iso(a.created_at), "suggested_starts_at": None, "status": None,
                     "appointment_id": a.id, "appointment_starts_at": iso(a.starts_at), "appointment_status": a.status, "note": None})
    rows.sort(key=lambda x: x["created_at"] or "", reverse=True)
    return rows
