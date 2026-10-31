import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

NAME_RE = re.compile(r"^[A-Za-z؀-ۿ][A-Za-z؀-ۿ .'-]*$")
PHONE_RE = re.compile(r"^(03\d{9}|\+923\d{9})$")  # 03001234567 or +923001234567


class RegisterRequest(BaseModel):
    """Patient self-registration. Role is NOT accepted from the client: always 'patient'."""

    full_name: str = Field(min_length=3, max_length=50)
    email: EmailStr
    phone: str
    date_of_birth: date
    gender: Literal["male", "female", "other"]
    password: str = Field(min_length=8, max_length=64)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not NAME_RE.match(v):
            raise ValueError("Name may contain only letters, spaces, . ' -")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.lower()

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = re.sub(r"[\s-]", "", v)
        if not PHONE_RE.match(v):
            raise ValueError("Enter a valid Pakistani mobile number, e.g. 03001234567")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, v: date) -> date:
        today = date.today()
        if v >= today:
            raise ValueError("Date of birth must be in the past")
        if today.year - v.year > 120:
            raise ValueError("Enter a valid date of birth")
        return v

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        checks = [
            (r"\s", False, "Password must not contain spaces"),
            (r"[a-z]", True, "Password needs a lowercase letter"),
            (r"[A-Z]", True, "Password needs an uppercase letter"),
            (r"\d", True, "Password needs a number"),
            (r"[^A-Za-z0-9\s]", True, "Password needs a special character"),
        ]
        for pattern, must_match, message in checks:
            if bool(re.search(pattern, v)) != must_match:
                raise ValueError(message)
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=64)
    role: Literal["patient", "doctor", "admin"]

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.lower()


class UserOut(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: str
    phone: str | None = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
