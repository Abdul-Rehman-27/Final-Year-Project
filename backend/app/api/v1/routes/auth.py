from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.services.chatbot_admin import write_audit
from app.schemas.auth import LoginRequest, PasswordResetConfirm, PasswordResetRequest, RegisterRequest, TokenResponse, UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    try:
        user = auth_service.register_patient(db, payload)
    except auth_service.EmailAlreadyRegistered:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    try:
        user = auth_service.authenticate(db, payload)
    except auth_service.InvalidCredentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email, password or role")
    except auth_service.AccountDisabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled")
    if user.role == "admin":
        write_audit(db, user.id, "admin_login", "auth", {}, {"role": user.role})
        db.commit()
    return _token_response(user)


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    try:
        challenge_id = auth_service.begin_password_reset(db, payload.email, payload.role)
    except RuntimeError:
        # Do not reveal whether the email exists when SMTP is unavailable.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Unable to send a verification code right now")
    except Exception:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Unable to send a verification code right now")
    return {"challenge_id": challenge_id, "message": "If the account is eligible, a verification code has been sent."}


@router.post("/password-reset/confirm")
def confirm_password_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    if not auth_service.complete_password_reset(db, payload.challenge_id, payload.code, payload.new_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The verification code is invalid or expired")
    return {"message": "Password updated successfully"}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
