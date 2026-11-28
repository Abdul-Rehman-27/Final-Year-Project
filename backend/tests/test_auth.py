import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.core.config import settings
from app.db.session import Base, get_db
from app.main import app
from app.models.password_reset import PasswordResetCode
from app.models.user import User

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSession = sessionmaker(bind=engine, autoflush=False)


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    def override():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


VALID = {
    "full_name": "Ayesha Khan",
    "email": "Ayesha@Example.com",
    "phone": "0300-1234567",
    "date_of_birth": "1998-05-14",
    "gender": "female",
    "password": "Strong@123",
}


def test_register_and_login(client):
    r = client.post("/api/v1/auth/register", json=VALID)
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["role"] == "patient"
    assert body["user"]["email"] == "ayesha@example.com"
    assert body["user"]["phone"] == "03001234567"

    r = client.post(
        "/api/v1/auth/login",
        json={"email": "ayesha@example.com", "password": "Strong@123", "role": "patient"},
    )
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200


def test_duplicate_email(client):
    client.post("/api/v1/auth/register", json=VALID)
    assert client.post("/api/v1/auth/register", json=VALID).status_code == 409


@pytest.mark.parametrize(
    "field,value",
    [
        ("full_name", "A1"),
        ("email", "not-an-email"),
        ("phone", "12345"),
        ("date_of_birth", "2999-01-01"),
        ("gender", "robot"),
        ("password", "weakpass"),
        ("password", "NoSpecial123"),
    ],
)
def test_register_validation(client, field, value):
    r = client.post("/api/v1/auth/register", json={**VALID, field: value})
    assert r.status_code == 422


def test_role_cannot_be_chosen_on_register(client):
    r = client.post("/api/v1/auth/register", json={**VALID, "role": "admin"})
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "patient"


def test_login_wrong_password_or_role(client):
    client.post("/api/v1/auth/register", json=VALID)
    base = {"email": "ayesha@example.com", "password": "Strong@123", "role": "patient"}
    assert client.post("/api/v1/auth/login", json={**base, "password": "Wrong@123"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={**base, "role": "admin"}).status_code == 401


def test_doctor_login_and_me_requires_token(client):
    db = TestingSession()
    db.add(User(full_name="Dr. Imran", email="doc@x.pk", password_hash=hash_password("Doctor@123"), role="doctor"))
    db.commit()
    db.close()
    r = client.post("/api/v1/auth/login", json={"email": "doc@x.pk", "password": "Doctor@123", "role": "doctor"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "doctor"
    token = r.json()["access_token"]
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def add_user(email, password, role="doctor", active=True):
    db = TestingSession()
    user = User(full_name="Dr. Imran" if role == "doctor" else "Ayesha Khan", email=email,
                password_hash=hash_password(password), role=role, is_active=active)
    db.add(user)
    db.commit()
    db.close()


def configure_reset_email(monkeypatch):
    sent = []
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "noreply@test.invalid")
    monkeypatch.setattr("app.services.auth_service.send_password_reset_code", lambda email, code: sent.append((email, code)))
    return sent


def request_reset(client, email, role="doctor"):
    response = client.post("/api/v1/auth/password-reset/request", json={"email": email, "role": role})
    assert response.status_code == 202
    return response.json()["challenge_id"]


def test_doctor_login_wrong_password_or_other_role(client):
    add_user("doctor@example.com", "Doctor@123")
    for role, password in (("doctor", "Wrong@123"), ("patient", "Doctor@123"), ("admin", "Doctor@123")):
        response = client.post("/api/v1/auth/login", json={"email": "doctor@example.com", "password": password, "role": role})
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid email, password or role"


def test_disabled_doctor_cannot_login_or_reset(client, monkeypatch):
    add_user("disabled@example.com", "Doctor@123", active=False)
    sent = configure_reset_email(monkeypatch)
    response = client.post("/api/v1/auth/login", json={"email": "disabled@example.com", "password": "Doctor@123", "role": "doctor"})
    assert response.status_code == 403
    request_reset(client, "disabled@example.com")
    assert sent == []


def test_doctor_password_reset_changes_only_doctor_account(client, monkeypatch):
    add_user("shared@example.com", "Patient@123", role="patient")
    add_user("shared@example.com", "Doctor@123", role="doctor")
    sent = configure_reset_email(monkeypatch)
    challenge_id = request_reset(client, "shared@example.com")
    assert len(sent) == 1
    assert sent[0][0] == "shared@example.com"
    response = client.post("/api/v1/auth/password-reset/confirm", json={"challenge_id": challenge_id, "code": sent[0][1], "new_password": "NewDoctor@123"})
    assert response.status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": "shared@example.com", "password": "Doctor@123", "role": "doctor"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "shared@example.com", "password": "NewDoctor@123", "role": "doctor"}).status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": "shared@example.com", "password": "Patient@123", "role": "patient"}).status_code == 200


def test_reset_code_attempt_limit_single_use_and_expiry(client, monkeypatch):
    add_user("doctor@example.com", "Doctor@123")
    sent = configure_reset_email(monkeypatch)
    challenge_id = request_reset(client, "doctor@example.com")
    code = sent[-1][1]
    wrong_code = "000000" if code != "000000" else "000001"
    for _ in range(5):
        assert client.post("/api/v1/auth/password-reset/confirm", json={"challenge_id": challenge_id, "code": wrong_code, "new_password": "NewDoctor@123"}).status_code == 400
    assert client.post("/api/v1/auth/password-reset/confirm", json={"challenge_id": challenge_id, "code": code, "new_password": "NewDoctor@123"}).status_code == 400

    challenge_id = request_reset(client, "doctor@example.com")
    code = sent[-1][1]
    assert client.post("/api/v1/auth/password-reset/confirm", json={"challenge_id": challenge_id, "code": code, "new_password": "NewDoctor@123"}).status_code == 200
    assert client.post("/api/v1/auth/password-reset/confirm", json={"challenge_id": challenge_id, "code": code, "new_password": "Another@123"}).status_code == 400

    challenge_id = request_reset(client, "doctor@example.com")
    code = sent[-1][1]
    db = TestingSession()
    challenge = db.scalar(select(PasswordResetCode).where(PasswordResetCode.challenge_id == challenge_id))
    challenge.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    db.close()
    assert client.post("/api/v1/auth/password-reset/confirm", json={"challenge_id": challenge_id, "code": code, "new_password": "Another@123"}).status_code == 400


def test_unknown_doctor_reset_is_generic_and_weak_password_is_rejected(client, monkeypatch):
    sent = configure_reset_email(monkeypatch)
    challenge_id = request_reset(client, "unknown@example.com")
    assert len(challenge_id) >= 32
    assert sent == []

    add_user("doctor@example.com", "Doctor@123")
    challenge_id = request_reset(client, "doctor@example.com")
    response = client.post("/api/v1/auth/password-reset/confirm", json={"challenge_id": challenge_id, "code": sent[-1][1], "new_password": "weakpass"})
    assert response.status_code == 422
