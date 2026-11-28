"""Demo seed scripts: idempotency and data consistency (P5f).

The demo data must look like data the real application produces, so these tests check the rules the doctor and
patient portals rely on: visit/appointment status agree, every visit has a booking number and token, nothing
overlaps, and future visits sit inside the doctor's availability and booking window.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.models.portal import PortalAppointment, PortalFollowupRecommendation, PortalNotification
from app.models.user import User
from app.services import availability as av
from app.services import patient_portal as pp
from app.services.portal_core import KARACHI, as_utc
from scripts import seed_doctor_demo, seed_followup_demo


@pytest.fixture()
def seeded(world):
    doctor = world.user("doctor", name="Dr. Imran Malik", email=settings.SEED_DOCTOR_EMAIL)
    started = datetime.now(timezone.utc)
    result = seed_doctor_demo.seed(world.db)
    followups = seed_followup_demo.seed(world.db)
    world.db.expire_all()
    return world, doctor, started, result, followups


def counts(db):
    return {
        "users": db.scalar(select(func.count(User.id))),
        "appointments": db.scalar(select(func.count(PortalAppointment.id))),
        "recommendations": db.scalar(select(func.count(PortalFollowupRecommendation.id))),
        "notifications": db.scalar(select(func.count(PortalNotification.id))),
    }


def appointments(db):
    return db.scalars(select(PortalAppointment).order_by(PortalAppointment.id)).all()


def test_seeds_create_data(seeded):
    world, doctor, started, result, followups = seeded
    assert result == {"patients": 7, "schedule_days": 2, "queue_visits": 7, "booked": 1}
    assert followups is True
    assert counts(world.db)["recommendations"] == 3


def test_seeds_are_idempotent(seeded):
    world, doctor, started, *_ = seeded
    before = counts(world.db)
    again = seed_doctor_demo.seed(world.db)
    again_followups = seed_followup_demo.seed(world.db)
    assert again == {"patients": 0, "schedule_days": 0, "queue_visits": 0, "booked": 0}
    assert again_followups is False
    assert counts(world.db) == before


def test_doctor_seed_recovers_a_missing_future_booking_without_duplicating_the_queue(seeded):
    world, doctor, started, *_ = seeded
    ayesha = world.db.scalar(select(User).where(User.email == "ayesha.khan@example.com"))
    future = [a for a in appointments(world.db) if a.patient_id == ayesha.id and as_utc(a.starts_at) > started + timedelta(hours=2)]
    assert len(future) == 1
    for a in future:
        world.db.delete(a)
    world.db.commit()
    queue_before = len([a for a in appointments(world.db) if abs(as_utc(a.starts_at) - started) <= timedelta(hours=2)])
    again = seed_doctor_demo.seed(world.db)
    assert again["booked"] == 1 and again["queue_visits"] == 0
    assert len([a for a in appointments(world.db) if abs(as_utc(a.starts_at) - started) <= timedelta(hours=2)]) == queue_before


def test_completed_visit_means_completed_appointment(seeded):
    world, *_ = seeded
    for a in appointments(world.db):
        if a.visit_status == "completed":
            assert a.status == "completed" and a.completed_at and a.checked_in_at and a.called_at
        if a.status == "completed":
            assert a.visit_status == "completed"
    assert any(a.status == "completed" for a in appointments(world.db))


def test_every_visit_has_booking_number_token_and_confirmed_status(seeded):
    world, *_ = seeded
    rows = appointments(world.db)
    assert not [a for a in rows if a.status == "pending"]          # the booking service auto-confirms
    for a in rows:
        assert a.booking_no == f"APT-{a.id:04d}" and a.token_no and a.duration_minutes
    tokens = [(a.doctor_id, a.token_date, a.token_no) for a in rows]
    assert len(tokens) == len(set(tokens))


def test_no_overlapping_visits_for_doctor_or_patient(seeded):
    world, doctor, *_ = seeded
    rows = [a for a in appointments(world.db) if a.status in ("confirmed", "completed")]
    avail = av.load(world.db, doctor.id)
    for key in ("doctor_id", "patient_id"):
        groups = {}
        for a in rows:
            groups.setdefault(getattr(a, key), []).append(a)
        for items in groups.values():
            spans = sorted((as_utc(a.starts_at), as_utc(a.starts_at) + timedelta(minutes=av.appointment_minutes(avail, a))) for a in items)
            for (s1, e1), (s2, e2) in zip(spans, spans[1:]):
                assert e1 <= s2, f"overlap between {s1}-{e1} and {s2}-{e2} ({key})"


def test_future_bookings_follow_availability_and_the_booking_window(seeded):
    world, doctor, started, *_ = seeded
    avail = av.load(world.db, doctor.id)
    today = datetime.now(KARACHI).date()
    checked = 0
    for a in appointments(world.db):
        starts = as_utc(a.starts_at)
        if abs(starts - started) <= timedelta(hours=2):      # today's queue is written directly (see seed docstring)
            continue
        day, minute = av.local_parts(starts)
        assert starts > started
        assert avail.session_at(day, minute) is not None, f"{starts} is outside the doctor's availability"
        assert day <= today + timedelta(days=pp.MAX_ADVANCE_DAYS)
        checked += 1
    assert checked == 4            # Ayesha booking, Bilal and Kamran follow-ups, Sidra booking


def test_future_demo_visit_is_a_real_booking(seeded):
    world, doctor, started, *_ = seeded
    ayesha = world.db.scalar(select(User).where(User.email == "ayesha.khan@example.com"))
    future = [a for a in appointments(world.db) if a.patient_id == ayesha.id and as_utc(a.starts_at) > started + timedelta(hours=2)]
    assert len(future) == 1
    a = future[0]
    assert a.source == "portal" and a.status == "confirmed" and a.visit_status == "scheduled"
    assert a.duration_minutes == pp.visit_minutes(world.db, doctor.id, a.starts_at)
