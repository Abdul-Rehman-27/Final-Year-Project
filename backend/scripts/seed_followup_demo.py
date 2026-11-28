"""Optional demo data for follow-ups, reschedule proposals and notification bells (never run automatically).

Run from /backend, AFTER `python -m scripts.seed` and `python -m scripts.seed_doctor_demo`:
    python -m scripts.seed_followup_demo

It goes through the real service functions (the same code the API uses), so every record obeys the booking rules and
both the doctor and the patients get genuine in-app notifications. Safe to run twice (it stops if it already ran).

Result (patients log in with SEED_DEMO_PATIENT_PASSWORD, e.g. ayesha.khan@example.com / Patient@12345):
  * Ayesha Khan    : PENDING follow-up recommendation (accept / choose another time / decline in the patient portal)
  * Bilal Ahmed    : follow-up scheduled DIRECTLY by the doctor (patient-agreed recorded) -> confirmed appointment
  * Kamran Ali     : recommendation ACCEPTED by the patient -> confirmed follow-up (doctor bell gets a notification)
  * Mariam Siddiqui: recommendation DECLINED by the patient (doctor bell gets a notification)
  * Sidra Aslam    : books a future visit; the doctor then PROPOSES another time (accept / decline in the patient portal)
"""
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.db.migrations.v004_admin_module import upgrade as upgrade_admin
from app.db.migrations.v005_doctor_portal import upgrade as upgrade_portal
from app.db.migrations.v008_doctor_availability import upgrade as upgrade_availability
from app.db.migrations.v009_followups import upgrade as upgrade_followups
from app.db.session import SessionLocal, engine
from app.models.portal import PortalAppointment, PortalFollowupRecommendation
from app.models.user import User
from app.services import appointment_changes as ac
from app.services import availability as av
from app.services import followups as fu
from app.services import patient_portal as pp
from app.services.portal_core import KARACHI, utcnow

NAMES = ("Ayesha Khan", "Bilal Ahmed", "Kamran Ali", "Mariam Siddiqui", "Sidra Aslam")


def candidate_slots(db, doctor_id, days=14):
    """(date text, HH:MM) of every slot the patient portal would offer for this doctor in the next `days` days."""
    today = datetime.now(KARACHI).date()
    out = []
    for i in range(1, days + 1):
        d = today + timedelta(days=i)
        for t in pp.day_slot_details(db, doctor_id, d):
            out.append((d.isoformat(), t["time"]))
    return out


def first_success(slots, action):
    """Try slots in order; a slot that is taken or breaks a rule (409/422) is skipped. Returns (result, slot) and removes the slot."""
    for slot in list(slots):
        try:
            result = action(*slot)
        except HTTPException as exc:
            if exc.status_code in (409, 422):
                continue
            raise
        slots.remove(slot)
        return result
    raise SystemExit("No free slot found in the next 14 days. Open /doctor/availability, enable a weekday and run again.")


def seed(db) -> bool:
    """Seed the follow-up / notification demo into `db`. Returns False when it had already been seeded."""
    doctor = db.scalar(select(User).where(User.email == settings.SEED_DOCTOR_EMAIL, User.role == "doctor"))
    if not doctor:
        raise SystemExit("Seeded doctor is missing; run python -m scripts.seed first")
    people = {u.full_name: u for u in db.scalars(select(User).where(User.role == "patient", User.full_name.in_(NAMES))).all()}
    missing = [n for n in NAMES if n not in people]
    if missing:
        raise SystemExit(f"Demo patients missing ({', '.join(missing)}); run python -m scripts.seed_doctor_demo first")
    if db.scalar(select(PortalFollowupRecommendation.id).where(PortalFollowupRecommendation.doctor_id == doctor.id)):
        return False

    def visit(name):
        """The patient's seeded visit with this doctor that can be linked (confirmed/completed, already started)."""
        a = db.scalar(select(PortalAppointment).where(
            PortalAppointment.patient_id == people[name].id, PortalAppointment.doctor_id == doctor.id,
            PortalAppointment.status.in_(fu.LINKABLE), PortalAppointment.starts_at <= utcnow() + timedelta(hours=1))
            .order_by(PortalAppointment.starts_at))
        if not a:
            raise SystemExit(f"No linkable visit found for {name}; run python -m scripts.seed_doctor_demo first")
        return a

    slots = candidate_slots(db, doctor.id)
    if not slots:
        raise SystemExit("The doctor has no bookable slots in the next 14 days. Open /doctor/availability, enable a weekday and run again.")

    # 1. Ayesha: pending recommendation
    first_success(slots, lambda d, t: fu.recommend(db, doctor, visit("Ayesha Khan"), d, t, "Please come back for a review of your test results."))
    # 2. Bilal: doctor schedules directly, patient agreed
    first_success(slots, lambda d, t: fu.schedule_directly(db, doctor, visit("Bilal Ahmed"), d, t, True))
    # 3. Kamran: recommendation accepted by the patient
    rec = first_success(slots, lambda d, t: fu.recommend(db, doctor, visit("Kamran Ali"), d, t, "Follow-up on blood pressure."))
    fu.accept(db, people["Kamran Ali"], rec)
    # 4. Mariam: recommendation declined by the patient
    rec = first_success(slots, lambda d, t: fu.recommend(db, doctor, visit("Mariam Siddiqui"), d, t, "Routine check."))
    fu.decline(db, people["Mariam Siddiqui"], rec, "I will book a time myself later.")
    # 5. Sidra: books a real future visit, then the doctor proposes another time (pending reschedule proposal)
    booked = first_success(slots, lambda d, t: pp.book(db, people["Sidra Aslam"], doctor.id, d, t))
    first_success(slots, lambda d, t: ac.propose(db, doctor, booked, d, t, "The doctor has to attend an urgent case at that time."))
    db.commit()
    return True


def main():
    upgrade_admin(engine); upgrade_portal(engine); upgrade_availability(engine); upgrade_followups(engine)
    with SessionLocal() as db:
        done = seed(db)
    print("seeded follow-up / notification demo" if done else "already seeded")


if __name__ == "__main__":
    main()
