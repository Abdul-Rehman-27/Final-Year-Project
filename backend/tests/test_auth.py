import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.db.session import Base, get_db
from app.main import app
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
    assert client.get("/api/v1/auth/me").status_code == 401
