from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user import Role, User
from app.schemas.auth import LoginRequest, RegisterRequest


class EmailAlreadyRegistered(Exception):
    pass


class InvalidCredentials(Exception):
    pass


class AccountDisabled(Exception):
    pass


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def register_patient(db: Session, data: RegisterRequest) -> User:
    if get_user_by_email(db, data.email):
        raise EmailAlreadyRegistered()
    user = User(
        full_name=data.full_name,
        email=data.email,
        password_hash=hash_password(data.password),
        role=Role.PATIENT.value,
        phone=data.phone,
        date_of_birth=data.date_of_birth,
        gender=data.gender,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# Dummy hash so a login for an unknown email takes the same time as a real one
_DUMMY_HASH = hash_password("not-a-real-password")


def authenticate(db: Session, data: LoginRequest) -> User:
    user = get_user_by_email(db, data.email)
    password_ok = verify_password(data.password, user.password_hash if user else _DUMMY_HASH)
    # Same error for wrong email / password / role so accounts can't be enumerated
    if not user or not password_ok or user.role != data.role:
        raise InvalidCredentials()
    if not user.is_active:
        raise AccountDisabled()
    return user
