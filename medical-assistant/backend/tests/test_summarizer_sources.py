"""Regression: scoping a summary to one doctor must not break the prescriptions query."""
import tempfile
from pathlib import Path

from sqlalchemy import create_engine, text

from app.summarizer.sources import CityHospitalSource


def _database() -> str:
    path = Path(tempfile.mkdtemp()) / "hospital.db"
    url = f"sqlite:///{path}"
    engine = create_engine(url)
    with engine.begin() as c:
        for ddl in (
            "CREATE TABLE users (id INTEGER, full_name TEXT, date_of_birth DATE, gender TEXT)",
            "CREATE TABLE portal_appointments (id INTEGER, patient_id INTEGER, doctor_id INTEGER, starts_at TEXT, status TEXT, reason TEXT)",
            "CREATE TABLE portal_prescriptions (id INTEGER, patient_id INTEGER, doctor_id INTEGER, issued_on TEXT, status TEXT, instructions TEXT)",
            "CREATE TABLE portal_prescription_items (id INTEGER, prescription_id INTEGER, medicine TEXT, dosage TEXT, timing TEXT, position INTEGER)",
            "CREATE TABLE portal_lab_reports (id INTEGER, patient_id INTEGER, requested_by_doctor_id INTEGER, test_name TEXT, kind TEXT, scheduled_for TEXT, results TEXT, findings TEXT, impression TEXT, status TEXT)",
            "CREATE TABLE portal_lab_report_files (id INTEGER, report_id INTEGER, name TEXT, content_type TEXT, data BLOB)",
            "INSERT INTO users VALUES (7, 'Test Patient', '1990-01-01', 'female')",
            "INSERT INTO portal_appointments VALUES (1, 7, 3, '2026-11-01', 'completed', 'cough')",
            "INSERT INTO portal_prescriptions VALUES (1, 7, 3, '2026-11-01', 'active', 'after meals')",
            "INSERT INTO portal_prescriptions VALUES (2, 7, 9, '2026-11-02', 'active', 'other doctor')",
            "INSERT INTO portal_prescription_items VALUES (1, 1, 'Paracetamol', '500mg', 'twice daily', 1)",
            "INSERT INTO portal_prescription_items VALUES (2, 2, 'Ibuprofen', '200mg', 'daily', 1)",
        ):
            c.execute(text(ddl))
    return url


def test_records_scoped_to_doctor_includes_only_that_doctors_prescriptions():
    records = CityHospitalSource(_database()).records("7", "3")
    assert records["patient"]["full_name"] == "Test Patient"
    assert [row["medicine"] for row in records["prescriptions"]] == ["Paracetamol"]


def test_records_without_doctor_scope_return_all_prescriptions():
    records = CityHospitalSource(_database()).records("7")
    assert {row["medicine"] for row in records["prescriptions"]} == {"Paracetamol", "Ibuprofen"}
