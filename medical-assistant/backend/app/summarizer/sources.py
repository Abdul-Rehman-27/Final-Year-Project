from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

from sqlalchemy import create_engine, text

from app.core import settings


class RecordSource(ABC):
    @abstractmethod
    def records(self, patient_id: str, doctor_id: str | None = None, appointment_id: str | None = None) -> dict: ...


class CityHospitalSource(RecordSource):
    """Read CityHospital records through SQL only; this package never imports portal models."""

    def __init__(self, url: str | None = None):
        self.url = url or settings.SUMMARIZER_DATABASE_URL or settings.MEDICAL_ASSISTANT_DATABASE_URL

    def records(self, patient_id: str, doctor_id: str | None = None, appointment_id: str | None = None) -> dict:
        if not self.url:
            return {"patient": {}, "appointments": [], "prescriptions": [], "reports": [], "files": [], "patient_records": []}
        engine = create_engine(self.url)
        params = {"patient_id": patient_id, "doctor_id": doctor_id, "appointment_id": appointment_id}
        scoped = " AND doctor_id = :doctor_id" if doctor_id is not None else ""
        prescription_scoped = " AND p.doctor_id = :doctor_id" if doctor_id is not None else ""
        report_scoped = " AND requested_by_doctor_id = :doctor_id" if doctor_id is not None else ""
        with engine.connect() as connection:
            one = lambda sql: connection.execute(text(sql), params).mappings().first()
            many = lambda sql: [dict(row) for row in connection.execute(text(sql), params).mappings().all()]
            patient = dict(one("SELECT id, full_name, date_of_birth, gender FROM users WHERE id = :patient_id") or {})
            if patient.get("date_of_birth"):
                born = patient["date_of_birth"]
                if isinstance(born, date): patient["age"] = date.today().year - born.year - ((date.today().month, date.today().day) < (born.month, born.day))
            appointments = many("SELECT id, starts_at, status, reason, doctor_id FROM portal_appointments WHERE patient_id = :patient_id" + scoped + " ORDER BY starts_at")
            if appointment_id is not None:
                appointments = [row for row in appointments if str(row["id"]) == str(appointment_id)]
            prescriptions = many("SELECT p.id, p.issued_on, p.status, p.instructions, i.medicine, i.dosage, i.timing FROM portal_prescriptions p JOIN portal_prescription_items i ON i.prescription_id = p.id WHERE p.patient_id = :patient_id" + prescription_scoped + " ORDER BY p.issued_on, i.position")
            reports = many("SELECT id, test_name, kind, scheduled_for, results, findings, impression, status FROM portal_lab_reports WHERE patient_id = :patient_id AND status = 'ready'" + report_scoped + " ORDER BY scheduled_for")
            files = many("SELECT f.name, f.content_type, f.data FROM portal_lab_report_files f JOIN portal_lab_reports r ON r.id = f.report_id WHERE r.patient_id = :patient_id AND r.status = 'ready'" + report_scoped)
            try:
                records = many("SELECT category, content, metadata, created_at FROM patient_records WHERE patient_id = :patient_id ORDER BY created_at")
            except Exception:
                records = []
        return {"patient": patient, "appointments": appointments, "prescriptions": prescriptions, "reports": reports, "files": files, "patient_records": records}
