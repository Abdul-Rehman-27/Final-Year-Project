from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, JSON, LargeBinary, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class PortalHospitalSettings(Base):
    __tablename__ = "portal_hospital_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    name: Mapped[str] = mapped_column(String(100), default="CityHospital")
    address: Mapped[str] = mapped_column(String(255), default="")
    phone: Mapped[str] = mapped_column(String(50), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    open_hours: Mapped[str] = mapped_column(String(100), default="Open 24 hours")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Karachi")
    grace_minutes: Mapped[int] = mapped_column(Integer, default=5)


class PortalAppointment(Base):
    __tablename__ = "portal_appointments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_no: Mapped[str | None] = mapped_column(String(32), unique=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    visit_status: Mapped[str] = mapped_column(String(20), default="scheduled")
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    token_no: Mapped[str | None] = mapped_column(String(16))
    token_date: Mapped[date | None] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(40), default="portal")
    room_label: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    __table_args__ = (
        UniqueConstraint("doctor_id", "token_date", "token_no", name="uq_portal_doctor_token"),
        Index("ix_portal_appointment_doctor_starts", "doctor_id", "starts_at"),
        Index("uq_portal_one_in_progress", "doctor_id", unique=True,
              postgresql_where=text("visit_status = 'in_progress'"), sqlite_where=text("visit_status = 'in_progress'")),
    )


class PortalDoctorSchedule(Base):
    __tablename__ = "portal_doctor_schedules"
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    weekday: Mapped[int] = mapped_column(Integer, primary_key=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    start_time: Mapped[str | None] = mapped_column(String(5))
    end_time: Mapped[str | None] = mapped_column(String(5))
    slot_minutes: Mapped[int] = mapped_column(Integer, default=15)
    room_label: Mapped[str] = mapped_column(String(40), default="")


class PortalPrescription(Base):
    __tablename__ = "portal_prescriptions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rx_no: Mapped[str | None] = mapped_column(String(32), unique=True)
    appointment_id: Mapped[int | None] = mapped_column(ForeignKey("portal_appointments.id"), index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    issued_on: Mapped[date] = mapped_column(Date)
    duration_days: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="active")
    instructions: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class PortalPrescriptionItem(Base):
    __tablename__ = "portal_prescription_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    prescription_id: Mapped[int] = mapped_column(ForeignKey("portal_prescriptions.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    medicine: Mapped[str] = mapped_column(String(100))
    dosage: Mapped[str] = mapped_column(String(60))
    timing: Mapped[str] = mapped_column(String(80))


class PortalLabTest(Base):
    __tablename__ = "portal_lab_tests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    kind: Mapped[str] = mapped_column(String(20))
    prep_note: Mapped[str] = mapped_column(String(500), default="")


class PortalLabReport(Base):
    __tablename__ = "portal_lab_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_no: Mapped[str | None] = mapped_column(String(32), unique=True)
    test_id: Mapped[int] = mapped_column(ForeignKey("portal_lab_tests.id"), index=True)
    test_name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20))
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    requested_by_doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    appointment_id: Mapped[int | None] = mapped_column(ForeignKey("portal_appointments.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="requested")
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str] = mapped_column(String(500), default="")
    results: Mapped[list] = mapped_column(JSON, default=list)
    findings: Mapped[str] = mapped_column(Text, default="")
    impression: Mapped[str] = mapped_column(Text, default="")
    comments: Mapped[str] = mapped_column(Text, default="")
    reported_by_name: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class PortalLabReportFile(Base):
    __tablename__ = "portal_lab_report_files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("portal_lab_reports.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(LargeBinary)


class PortalClinicalSummary(Base):
    __tablename__ = "portal_clinical_summaries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    appointment_id: Mapped[int | None] = mapped_column(ForeignKey("portal_appointments.id"), index=True)
    source_hash: Mapped[str] = mapped_column(String(64), index=True)
    fields: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
