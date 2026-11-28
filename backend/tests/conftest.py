"""Shared fixtures: in-memory SQLite DB, TestClient, and user/appointment factories."""
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import create_access_token, hash_password
from app.db.migrations.v004_admin_module import upgrade as upgrade_admin
from app.db.migrations.v005_doctor_portal import upgrade as upgrade_portal
from app.db.session import Base, get_db
from app.main import app
from app.models.admin import AdminDepartment, AdminStaffProfile
from app.models.portal import PortalAppointment
from app.models.user import User
from app.services.portal_core import assign_token

_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(bind=_engine, autoflush=False)


class World:
    """Test helper bundling the client, a DB session and object factories."""

    def __init__(self, client, db):
        self.client, self.db, self._n = client, db, 0

    def user(self, role, name=None, email=None, dob=None, gender="female"):
        self._n += 1
        u = User(full_name=name or f"{role.title()} {self._n}", email=email or f"{role}{self._n}@example.com",
                 password_hash=hash_password("Passw0rd!x"), role=role, gender=gender,
                 date_of_birth=dob or date(1990, 1, 1))
        self.db.add(u); self.db.commit(); return u

    def department(self, name="Cardiology"):
        d = AdminDepartment(name=name, name_key=name.lower(), description="")
        self.db.add(d); self.db.commit(); return d

    def doctor(self, name="Dr. Sana Malik", department="Cardiology", specialty="Cardiologist"):
        d = self.user("doctor", name=name)
        dep = self.db.query(AdminDepartment).filter_by(name=department).first() or self.department(department)
        self.db.add(AdminStaffProfile(user_id=d.id, department_id=dep.id, specialty=specialty)); self.db.commit()
        return d

    def headers(self, user):
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    def appt(self, patient, doctor, minutes=0, days=0, status="confirmed", visit="scheduled", checked=None, token=True, **kw):
        a = PortalAppointment(patient_id=patient.id, doctor_id=doctor.id,
                              starts_at=datetime.now(timezone.utc) + timedelta(minutes=minutes, days=days),
                              status=status, visit_status=visit, room_label="Floor 2 · Room 12", **kw)
        if checked is not None:
            a.checked_in_at = datetime.now(timezone.utc) + timedelta(minutes=checked)
        self.db.add(a); self.db.flush(); a.booking_no = f"APT-{a.id:04d}"
        if token and status in ("confirmed", "completed"):
            assign_token(self.db, a)
        self.db.commit(); return a


@pytest.fixture()
def world():
    Base.metadata.drop_all(_engine); Base.metadata.create_all(_engine)
    upgrade_admin(_engine); upgrade_portal(_engine)

    def override():
        s = _Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    db = _Session()
    yield World(TestClient(app), db)
    db.close(); app.dependency_overrides.clear()
