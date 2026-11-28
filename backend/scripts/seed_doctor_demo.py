"""Create optional doctor-portal demonstration data (never run automatically).

Run from /backend, AFTER `python -m scripts.seed`:
    python -m scripts.seed_doctor_demo

What it creates (every step is idempotent, so it is safe to run twice):
  * 7 demo patients and the doctor's weekly schedule (only weekdays that have no schedule row yet);
  * TODAY'S QUEUE (7 visits around "now"). These cannot go through the booking service - it refuses times in the
    past and times outside the doctor's schedule - so they are written directly, but with exactly the fields the real
    workflow produces: booking number, token, confirmed status, 15-minute duration (no overlaps), and for visits that
    already ran the same state the doctor workflow leaves behind (completed visit => appointment status `completed`);
  * ONE future visit for the first patient, created through the real booking service (`patient_portal.book`), so it
    obeys doctor availability, the 30-day window, overlap rules, auto-confirmation and token assignment.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.migrations.v004_admin_module import upgrade as upgrade_admin
from app.db.migrations.v005_doctor_portal import upgrade as upgrade_portal
from app.db.migrations.v008_doctor_availability import upgrade as upgrade_availability
from app.db.migrations.v009_followups import upgrade as upgrade_followups
from app.db.session import SessionLocal, engine
from app.models.admin import AdminDepartment, AdminStaffProfile
from app.models.portal import PortalAppointment, PortalDoctorSchedule
from app.models.user import User
from app.services import patient_portal as pp
from app.services.portal_core import KARACHI, assign_token

PEOPLE = [("Ayesha Khan", 34, "female"), ("Bilal Ahmed", 52, "male"), ("Kamran Ali", 60, "male"),
          ("Mariam Siddiqui", 45, "female"), ("Sidra Aslam", 28, "female"), ("Usman Tariq", 39, "male"),
          ("Zainab Iqbal", 31, "female")]
QUEUE_MINUTES = (-85, -70, -33, -3, 12, 27, 57)   # start offsets from "now"; the closest gap is 15 minutes
QUEUE_VISIT_MINUTES = 15                          # = the smallest gap, so no two queue visits overlap
ROOM = "Floor 2 · Room 12"
SCHEDULE = ((0, "14:00", "17:00", 15), (3, "10:30", "12:45", 45))   # (weekday, start, end, slot minutes)
BOOKING_DAYS = 14


def _free_slots(db: Session, doctor_id: int):
    today = datetime.now(KARACHI).date()
    for i in range(1, BOOKING_DAYS + 1):
        day = today + timedelta(days=i)
        for slot in pp.day_slot_details(db, doctor_id, day):
            yield day.isoformat(), slot["time"]


def seed(db: Session) -> dict:
    """Seed the doctor demo data into `db`. Returns what was created (all zeros when everything already existed)."""
    created = {"patients": 0, "schedule_days": 0, "queue_visits": 0, "booked": 0}
    doctor = db.scalar(select(User).where(User.email == settings.SEED_DOCTOR_EMAIL, User.role == "doctor"))
    if not doctor:
        raise SystemExit("Seeded doctor is missing; run python -m scripts.seed first")

    department = db.scalar(select(AdminDepartment).where(AdminDepartment.name == "Cardiology"))
    if not department:
        department = AdminDepartment(name="Cardiology", name_key="cardiology", description="")
        db.add(department); db.flush()
    if not db.get(AdminStaffProfile, doctor.id):
        db.add(AdminStaffProfile(user_id=doctor.id, department_id=department.id, specialty="Cardiologist"))

    for weekday, start, end, slot in SCHEDULE:
        if not db.get(PortalDoctorSchedule, (doctor.id, weekday)):
            db.add(PortalDoctorSchedule(doctor_id=doctor.id, weekday=weekday, is_active=True, start_time=start,
                                        end_time=end, slot_minutes=slot, room_label=ROOM))
            created["schedule_days"] += 1

    now = datetime.now(timezone.utc)
    patients = []
    for name, age, gender in PEOPLE:
        email = name.lower().replace(" ", ".") + "@example.com"
        p = db.scalar(select(User).where(User.email == email, User.role == "patient"))
        if not p:
            p = User(full_name=name, email=email, password_hash=hash_password(settings.SEED_DEMO_PATIENT_PASSWORD),
                     role="patient", gender=gender, date_of_birth=now.date().replace(year=now.year - age))
            db.add(p); created["patients"] += 1
        patients.append(p)
    db.flush()

    for i, minutes in enumerate(QUEUE_MINUTES):
        has_any = db.scalar(select(PortalAppointment.id).where(
            PortalAppointment.patient_id == patients[i].id, PortalAppointment.doctor_id == doctor.id).limit(1))
        if has_any:
            continue
        a = PortalAppointment(patient_id=patients[i].id, doctor_id=doctor.id, starts_at=now + timedelta(minutes=minutes),
                              status="confirmed", visit_status="scheduled", room_label=ROOM,
                              duration_minutes=QUEUE_VISIT_MINUTES)
        db.add(a); db.flush()
        a.booking_no = f"APT-{a.id:04d}"; assign_token(db, a)
        if i == 0:      # finished visit: the doctor workflow sets BOTH visit_status and appointment status
            a.checked_in_at = now + timedelta(minutes=-80); a.called_at = now + timedelta(minutes=-65)
            a.visit_status = "completed"; a.status = "completed"; a.completed_at = now + timedelta(minutes=-60)
        elif i == 1:    # closed without finishing: visit_status only, the appointment stays confirmed (as in the API)
            a.checked_in_at = now + timedelta(minutes=-68); a.called_at = now + timedelta(minutes=-62)
            a.visit_status = "incomplete"; a.completed_at = now + timedelta(minutes=-55)
        elif i == 2:
            a.checked_in_at = now + timedelta(minutes=-40); a.called_at = now + timedelta(minutes=-22)
            a.visit_status = "in_progress"
        elif i in (4, 5):
            a.checked_in_at = now + timedelta(minutes=minutes - 18)
        created["queue_visits"] += 1
    db.commit()

    # One future visit through the REAL booking service (never a hand-written row).
    first = patients[0]
    has_future = any(a.starts_at.replace(tzinfo=timezone.utc) > now for a in db.scalars(select(PortalAppointment).where(
        PortalAppointment.patient_id == first.id, PortalAppointment.doctor_id == doctor.id,
        PortalAppointment.status.in_(pp.ACTIVE))).all())
    if not has_future:
        for day, hhmm in _free_slots(db, doctor.id):
            try:
                pp.book(db, first, doctor.id, day, hhmm)
            except pp.HTTPException as exc:
                if exc.status_code in (409, 422):
                    continue
                raise
            created["booked"] += 1
            break
        else:
            raise SystemExit(f"No free slot in the next {BOOKING_DAYS} days; enable a weekday in the doctor schedule and run again.")
    return created


def main():
    upgrade_admin(engine); upgrade_portal(engine); upgrade_availability(engine); upgrade_followups(engine)
    with SessionLocal() as db:
        result = seed(db)
    print("seeded doctor portal demo" if any(result.values()) else "already seeded", result)


if __name__ == "__main__":
    main()
