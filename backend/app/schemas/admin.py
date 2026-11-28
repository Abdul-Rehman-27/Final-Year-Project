import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


def _camel(name: str) -> str:
    first, *rest = name.split("_")
    return first + "".join(part.capitalize() for part in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True, str_strip_whitespace=True)


class DepartmentIn(CamelModel):
    name: str = Field(min_length=2, max_length=40)
    description: str = Field(default="", max_length=200)


class PermissionIn(CamelModel):
    name: str = Field(min_length=2, max_length=40)
    code: str = Field(min_length=1, max_length=40, pattern=r"^[a-z][a-z0-9_:]*$")
    description: str = Field(default="", max_length=200)


class RoleIn(CamelModel):
    name: str = Field(min_length=2, max_length=30)
    description: str = Field(default="", max_length=200)


class RolePermissionsIn(CamelModel):
    permission_ids: list[int] = Field(default_factory=list, max_length=200)


class StaffIn(CamelModel):
    full_name: str = Field(min_length=3, max_length=50)
    email: EmailStr | None = None
    phone: str = Field(min_length=1, max_length=20)
    role: str = Field(min_length=1, max_length=20, pattern=r"^[a-z][a-z0-9_-]*$")
    department_id: int = Field(gt=0)
    photo: str = Field(default="", max_length=3_000_000)
    specialty: str = Field(default="", max_length=50)
    fee: int | None = Field(default=None, ge=100, le=100000)
    status: Literal["active", "inactive"] = "active"

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not re.fullmatch(r"[A-Za-z؀-ۿ][A-Za-z؀-ۿ .'-]*", value):
            raise ValueError("Name may contain only letters, spaces, . ' -")
        return " ".join(value.split())

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr | None) -> str | None:
        return str(value).lower() if value is not None else None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        value = re.sub(r"[\s-]", "", value)
        if not re.fullmatch(r"(?:03\d{9}|\+923\d{9})", value):
            raise ValueError("Enter a valid Pakistani mobile number")
        return value

    @model_validator(mode="after")
    def validate_doctor_fields(self):
        if self.role == "doctor":
            if len(self.specialty.strip()) < 2:
                raise ValueError("Doctor specialty is required")
            if self.fee is None:
                raise ValueError("Doctor consultation fee is required")
        return self


_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class HospitalProfileIn(CamelModel):
    name: str = Field(min_length=2, max_length=100)
    address: str = Field(default="", max_length=255)
    phone: str = Field(default="", max_length=50)
    email: str = Field(default="", max_length=255)
    emergency_number: str = Field(default="", max_length=50)
    open_24_hours: bool = True
    opens_at: str | None = None
    closes_at: str | None = None
    lab_opens_at: str | None = None
    lab_closes_at: str | None = None

    @field_validator("phone", "emergency_number")
    @classmethod
    def validate_phone_like(cls, value: str) -> str:
        if value and not re.fullmatch(r"[0-9+()\s-]{3,50}", value):
            raise ValueError("Enter a valid phone number")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if value and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address")
        return value.lower()

    @field_validator("opens_at", "closes_at", "lab_opens_at", "lab_closes_at", mode="before")
    @classmethod
    def validate_time(cls, value):
        if value in (None, ""):
            return None
        if not isinstance(value, str) or not _HHMM.fullmatch(value):
            raise ValueError("Time must be HH:MM (24-hour)")
        return value

    @model_validator(mode="after")
    def validate_hours(self):
        if not self.open_24_hours:
            if not self.opens_at or not self.closes_at:
                raise ValueError("Opening and closing time are required")
            if self.opens_at >= self.closes_at:
                raise ValueError("Closing time must be after opening time")
        if bool(self.lab_opens_at) != bool(self.lab_closes_at):
            raise ValueError("Set both lab opening and closing time, or neither")
        if self.lab_opens_at and self.lab_opens_at >= self.lab_closes_at:
            raise ValueError("Lab closing time must be after opening time")
        return self
