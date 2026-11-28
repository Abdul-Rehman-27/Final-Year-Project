from typing import Literal

from pydantic import BaseModel, Field


class CreateConversation(BaseModel):
    title: str = Field(default="New conversation", min_length=1, max_length=160)


class SendMessage(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    # NEW: the assistant message the patient is replying to (optional).
    reply_to: str | None = Field(default=None, max_length=300)


class ActionResultIn(BaseModel):
    """NEW (step 4): the patient's browser reports that the portal carried out (or refused) a chat booking action.
    Only the appointment id and the error code are accepted: the details shown in the chat are read from the portal database."""
    action_id: str = Field(min_length=1, max_length=64)
    ok: bool
    appointment_id: int | None = None
    code: str | None = Field(default=None, max_length=64)


class ModelSelection(BaseModel):
    primary_provider: str = Field(pattern="^(groq|ollama)$")
    groq_model: str | None = Field(default=None, min_length=1, max_length=160)
    ollama_model: str | None = Field(default=None, min_length=1, max_length=160)
    monthly_token_limit: int | None = Field(default=None, ge=0)
    auto_fallback_enabled: bool | None = None


class ModelConfigOut(BaseModel):
    primary_provider: str
    groq_model: str
    ollama_model: str
    monthly_token_limit: int


class ServiceToggle(BaseModel):
    enabled: bool


class AdminSettingsUpdate(BaseModel):
    primary_provider: Literal["groq", "ollama"]
    active_model: str = Field(min_length=1, max_length=160)
    auto_fallback_enabled: bool
    fallback_model: str = Field(default="", max_length=160)
    monthly_token_limit: int = Field(ge=0)

