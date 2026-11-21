import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user import Role, User
from app.models.password_reset import PasswordResetCode
from app.schemas.auth import LoginRequest, RegisterRequest
from app.core.config import settings
from app.services.email_service import send_password_reset_code


class EmailAlreadyRegistered(Exception):
    pass


class InvalidCredentials(Exception):
    pass


class AccountDisabled(Exception):
    pass


def get_user_by_email(db: Session, email: str, role: str | None = None) -> User | None:
    query = select(User).where(User.email == email.lower())
    if role:
        query = query.where(User.role == role)
    return db.scalar(query)


def register_patient(db: Session, data: RegisterRequest) -> User:
    if get_user_by_email(db, data.email, Role.PATIENT.value):
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
    user = get_user_by_email(db, data.email, data.role)
    password_ok = verify_password(data.password, user.password_hash if user else _DUMMY_HASH)
    # Same error for wrong email / password / role so accounts can't be enumerated
    if not user or not password_ok or user.role != data.role:
        raise InvalidCredentials()
    if not user.is_active:
        raise AccountDisabled()
    return user


def _reset_code_hash(code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()


def begin_password_reset(db: Session, email: str, role: str) -> str:
    """Send a short-lived code; return an opaque challenge identifier."""
    challenge_id = secrets.token_urlsafe(32)
    user = get_user_by_email(db, email, role)
    if not user or user.role != role or not user.is_active:
        # Keep account lookup behavior independent from SMTP configuration.
        if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
            raise RuntimeError("Password reset email is not configured")
        return challenge_id

    code = f"{secrets.randbelow(1_000_000):06d}"
    db.execute(
        update(PasswordResetCode)
        .where(PasswordResetCode.user_id == user.id, PasswordResetCode.used.is_(False))
        .values(used=True)
    )
    challenge = PasswordResetCode(
        challenge_id=challenge_id,
        user_id=user.id,
        code_hash=_reset_code_hash(code),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_RESET_CODE_TTL_MINUTES),
    )
    db.add(challenge)
    db.commit()
    try:
        send_password_reset_code(user.email, code)
    except Exception:
        challenge.used = True
        db.commit()
        raise
    return challenge_id


def complete_password_reset(db: Session, challenge_id: str, code: str, new_password: str) -> bool:
    challenge = db.scalar(
        select(PasswordResetCode).where(PasswordResetCode.challenge_id == challenge_id).with_for_update()
    )
    now = datetime.now(timezone.utc)
    if not challenge or challenge.used or challenge.attempts >= 5:
        return False
    expiry = challenge.expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry <= now:
        challenge.used = True
        db.commit()
        return False
    if not hmac.compare_digest(challenge.code_hash, _reset_code_hash(code)):
        challenge.attempts += 1
        db.commit()
        return False

    user = db.get(User, challenge.user_id)
    if not user or not user.is_active:
        challenge.used = True
        db.commit()
        return False
    user.password_hash = hash_password(new_password)
    challenge.used = True
    db.execute(
        update(PasswordResetCode)
        .where(PasswordResetCode.user_id == user.id, PasswordResetCode.id != challenge.id)
        .values(used=True)
    )
    db.commit()
    return True
