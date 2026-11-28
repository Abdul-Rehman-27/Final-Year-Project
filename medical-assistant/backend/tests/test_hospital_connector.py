import json
import os
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

os.environ["MEDICAL_ASSISTANT_DB"] = str(Path(tempfile.mkdtemp()) / "test.sqlite3")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text

from app.hospital_connector import HospitalConnector

# Fixed "now": Saturday 2026-11-28 05:00 Karachi = 00:00 UTC. 2026-11-30 is a Monday.
NOW = datetime(2026, 11, 28, 0, 0, tzinfo=timezone.utc)
MONDAY = date(2026, 11, 30)


def make_portal(tmp_path):
    url = f"sqlite:///{tmp_path / 'portal.sqlite3'}"
    engine = create_engine(url)
    with engine.begin() as c:
        for sql in (
            "CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT, role TEXT, is_active BOOLEAN)",
            "CREATE TABLE admin_departments (id INTEGER PRIMARY KEY, name TEXT)",
            "CREATE TABLE admin_staff_profiles (user_id INTEGER PRIMARY KEY, department_id INTEGER, specialty TEXT)",
            "CREATE TABLE portal_doctor_schedules (doctor_id INTEGER, weekday INTEGER, is_active BOOLEAN, start_time TEXT, end_time TEXT, slot_minutes INTEGER, room_label TEXT, sessions_json TEXT, breaks_json TEXT)",
            "CREATE TABLE portal_schedule_exceptions (id INTEGER PRIMARY KEY, doctor_id INTEGER, day DATE, kind TEXT, sessions_json TEXT, breaks_json TEXT)",
            "CREATE TABLE portal_appointments (id INTEGER PRIMARY KEY, patient_id INTEGER, doctor_id INTEGER, starts_at TIMESTAMP, status TEXT, duration_minutes INTEGER, token_no TEXT, booking_no TEXT, room_label TEXT, visit_status TEXT, checked_in_at TIMESTAMP)",
            "CREATE TABLE portal_hospital_settings (id INTEGER PRIMARY KEY, name TEXT, address TEXT, phone TEXT, email TEXT, open_hours TEXT, emergency_number TEXT)",
        ):
            c.execute(text(sql))
        c.execute(text("INSERT INTO admin_departments VALUES (1, 'Cardiology'), (2, 'Dermatology')"))
        c.execute(text("INSERT INTO users VALUES (10, 'Dr. Sana Malik', 'doctor', 1), (11, 'Dr. Off Duty', 'doctor', 1), (12, 'Dr. Inactive', 'doctor', 0), (13, 'Dr. No Department', 'doctor', 1), (99, 'Patient', 'patient', 1)"))
        c.execute(text("INSERT INTO admin_staff_profiles VALUES (10, 1, 'Cardiologist'), (11, 1, ''), (12, 2, 'Skin'), (13, NULL, '')"))
        sessions = json.dumps([{"start_time": "10:00", "end_time": "12:00", "slot_minutes": 30, "room_label": "Room 4"}])
        breaks = json.dumps([{"start_time": "11:00", "end_time": "11:30"}])
        # Dr. Sana: Mondays 10:00-12:00, 30 min, break 11:00-11:30. Dr. Off Duty / 12 / 13 have no active day.
        c.execute(text("INSERT INTO portal_doctor_schedules VALUES (10, 0, 1, NULL, NULL, 15, '', :s, :b)"), {"s": sessions, "b": breaks})
        c.execute(text("INSERT INTO portal_doctor_schedules VALUES (11, 0, 0, NULL, NULL, 15, '', NULL, NULL)"))
        c.execute(text("INSERT INTO portal_doctor_schedules VALUES (12, 0, 1, '09:00', '10:00', 15, 'R1', NULL, NULL)"))
        c.execute(text("INSERT INTO portal_doctor_schedules VALUES (13, 0, 1, '09:00', '10:00', 15, 'R1', NULL, NULL)"))
        c.execute(text("INSERT INTO portal_hospital_settings VALUES (1, 'CityHospital', 'Main Road', '021-111-222', 'a@b.pk', 'Open 24 hours', '021-555-0100')"))
    return url, engine


def test_hospital_info_and_bookable_doctors(tmp_path):
    url, _ = make_portal(tmp_path)
    connector = HospitalConnector(url, now=lambda: NOW)
    assert connector.hospital()["emergency_number"] == "021-555-0100"
    assert [d["name"] for d in connector.doctors()] == ["Dr. Sana Malik"]   # off duty, inactive and no-department doctors are not bookable
    assert connector.doctors()[0]["department"] == "Cardiology"


def test_slots_follow_sessions_breaks_and_existing_bookings(tmp_path):
    url, engine = make_portal(tmp_path)
    connector = HospitalConnector(url, now=lambda: NOW)
    assert [s["time"] for s in connector.slots(10, MONDAY)] == ["10:00", "10:30", "11:30"]   # 11:00 is a break
    assert connector.slots(10, MONDAY)[0]["room_label"] == "Room 4"
    assert connector.slots(10, date(2026, 12, 1)) == []                                      # Tuesday: no schedule
    with engine.begin() as c:   # booked 10:30 Karachi = 05:30 UTC, stored without a zone (SQLite) and pending
        c.execute(text("INSERT INTO portal_appointments (id, patient_id, doctor_id, starts_at, status, duration_minutes) VALUES (1, 50, 10, '2026-11-30 05:30:00.000000', 'pending', NULL)"))
        c.execute(text("INSERT INTO portal_appointments (id, patient_id, doctor_id, starts_at, status, duration_minutes) VALUES (2, 51, 10, '2026-11-30 05:00:00.000000', 'cancelled', NULL)"))
    assert [s["time"] for s in connector.slots(10, MONDAY)] == ["10:00", "11:30"]            # cancelled bookings free the slot
    # The patient's own booking elsewhere blocks the same time, other patients' do not matter
    with engine.begin() as c:
        c.execute(text("INSERT INTO portal_appointments (id, patient_id, doctor_id, starts_at, status, duration_minutes) VALUES (3, 77, 12, '2026-11-30 06:30:00.000000', 'confirmed', 30)"))   # 11:30 Karachi, other doctor
    assert [s["time"] for s in connector.slots(10, MONDAY, patient_id=77)] == ["10:00"]


def test_past_slots_leave_exceptions_window_and_next_slots(tmp_path):
    url, engine = make_portal(tmp_path)
    later = HospitalConnector(url, now=lambda: datetime(2026, 11, 30, 5, 10, tzinfo=timezone.utc))   # Monday 10:10 Karachi
    assert [s["time"] for s in later.slots(10, MONDAY)] == ["10:30", "11:30"]
    connector = HospitalConnector(url, now=lambda: NOW)
    assert connector.next_slots(10)["date"] == "2026-11-30"
    with engine.begin() as c:   # leave on that Monday: the next free day is the following Monday
        c.execute(text("INSERT INTO portal_schedule_exceptions VALUES (1, 10, '2026-11-30', 'leave', NULL, NULL)"))
    assert connector.slots(10, MONDAY) == []
    assert connector.next_slots(10)["date"] == "2026-12-07"
    assert connector.slots(10, date(2027, 1, 18)) == []     # beyond the 30-day booking window
    with engine.begin() as c:   # extra session on a Tuesday adds slots only there
        c.execute(text("INSERT INTO portal_schedule_exceptions VALUES (2, 10, '2026-12-01', 'extra_session', :s, NULL)"),
                  {"s": json.dumps([{"start_time": "14:00", "end_time": "15:00", "slot_minutes": 30, "room_label": "R9"}])})
    assert [s["time"] for s in connector.slots(10, date(2026, 12, 1))] == ["14:00", "14:30"]
