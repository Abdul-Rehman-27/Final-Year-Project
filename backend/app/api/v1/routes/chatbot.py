from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.chatbot import ChatConversation, ChatMessage, ModelConfig, ModelUsage
from app.models.user import User
from app.schemas.chatbot import CreateConversation, ModelSelection, SendMessage
from app.services.medical_assistant_client import MedicalAssistantError, request
from app.services.chatbot_admin import build_initial_state, get_model_config, provider_health, write_audit
from app.services.websocket_manager import manager

router = APIRouter(tags=["chatbot"])


def _model_config(db: Session) -> ModelConfig:
    """Read the singleton chatbot configuration row."""
    return get_model_config(db)


def _utc_month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def _record_blocked_query(db: Session, user: User, conversation: ChatConversation, provider: str, model: str, error_type: str):
    """Store a rejected chatbot request so admin query/error totals stay accurate."""
    db.add(ModelUsage(
        patient_id=user.id,
        conversation_id=conversation.id,
        provider=provider,
        model=model,
        success=False,
        status="error",
        error_type=error_type,
    ))
    db.commit()
    state = build_initial_state(db, manager.latest_health or {"available": False, "status": None})
    await manager.broadcast("query_completed", {"usage": state["usage"], "model": None})


def _assistant_options(service_status: dict) -> dict:
    """Convert the Medical Assistant health reply to provider cards."""
    body = service_status.get("status") or {}
    models = body.get("models", {})
    groq = models.get("primary", {})
    ollama = models.get("fallback", {})
    return {
        "groq": {"status": "online" if groq.get("connected") else "offline", "models": groq.get("models", [])},
        "ollama": {"status": "online" if ollama.get("connected") else "offline", "models": ollama.get("models", [])},
    }


async def _chat_config(db: Session):
    """Use the latest server health check and fill model defaults once."""
    config = _model_config(db)
    health = manager.latest_health or {"available": False, "status": None}
    options = _assistant_options(health)
    if options["ollama"]["models"]:
        if not config.fallback_model:
            config.fallback_model = options["ollama"]["models"][0]
        if not config.ollama_model:
            config.ollama_model = config.fallback_model
        db.commit()
        db.refresh(config)
    return config, health, options


@router.post("/chat/sessions", status_code=status.HTTP_201_CREATED)
async def create_chat_session(
    payload: CreateConversation,
    user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    """Create a patient-owned chat session in CityHospital and Medical Assistant."""
    config = _model_config(db)
    if not config.medical_assistant_enabled:
        raise HTTPException(503, "The Medical Assistant service is disabled by an administrator.")
    try:
        remote = await request("POST", "/api/v1/chat/sessions", json={"patient_id": str(user.id), "title": payload.title})
    except MedicalAssistantError as exc:
        raise HTTPException(503, str(exc)) from exc
    conversation = ChatConversation(medical_assistant_id=remote["id"], patient_id=user.id, title=remote.get("title", payload.title))
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return {"id": conversation.id, "title": conversation.title, "created_at": conversation.created_at, "messages": []}


@router.get("/chat/sessions")
async def list_chat_sessions(user: User = Depends(require_roles("patient")), db: Session = Depends(get_db)):
    """List the signed-in patient's saved chatbot sessions."""
    return db.scalars(select(ChatConversation).where(ChatConversation.patient_id == user.id).order_by(ChatConversation.updated_at.desc())).all()


@router.get("/chat/sessions/{conversation_id}")
async def get_chat_session(conversation_id: int, user: User = Depends(require_roles("patient")), db: Session = Depends(get_db)):
    """Load a patient-owned session and its messages."""
    conversation = db.scalar(select(ChatConversation).where(ChatConversation.id == conversation_id, ChatConversation.patient_id == user.id))
    if conversation is None:
        raise HTTPException(404, "Conversation not found")
    try:
        remote = await request("GET", f"/api/v1/chat/sessions/{conversation.medical_assistant_id}", params={"patient_id": str(user.id)})
    except MedicalAssistantError as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"id": conversation.id, "title": conversation.title, "created_at": conversation.created_at, "messages": remote.get("messages", [])}


@router.post("/chat/sessions/{conversation_id}/messages")
async def send_chat_message(
    conversation_id: int,
    payload: SendMessage,
    user: User = Depends(require_roles("patient")),
    db: Session = Depends(get_db),
):
    """Route a patient message through the configured provider and store usage."""
    conversation = db.scalar(select(ChatConversation).where(ChatConversation.id == conversation_id, ChatConversation.patient_id == user.id))
    if conversation is None:
        raise HTTPException(404, "Conversation not found")
    config = _model_config(db)
    started = datetime.now(timezone.utc)
    db.add(ChatMessage(conversation_id=conversation.id, role="user", content=payload.message.strip()))
    if not config.medical_assistant_enabled:
        await _record_blocked_query(db, user, conversation, config.primary_provider, "", "service_disabled")
        raise HTTPException(503, "The Medical Assistant service is disabled by an administrator.")

    request_provider = config.primary_provider
    request_model = config.groq_model if request_provider == "groq" else config.ollama_model
    fallback_reason = None
    provider_flag = config.groq_enabled if request_provider == "groq" else config.ollama_enabled
    if not provider_flag:
        await _record_blocked_query(db, user, conversation, request_provider, request_model, "provider_disabled")
        raise HTTPException(503, "The selected chatbot provider is disabled by an administrator.")

    # Use Ollama before sending a request when the configured Groq monthly limit is exhausted.
    if request_provider == "groq" and config.monthly_token_limit:
        month_start = _utc_month_start(datetime.now(timezone.utc))
        groq_tokens = db.scalar(select(func.coalesce(func.sum(ModelUsage.total_tokens), 0)).where(ModelUsage.provider == "groq", ModelUsage.created_at >= month_start)) or 0
        if groq_tokens >= config.monthly_token_limit:
            if not config.auto_fallback_enabled or not config.ollama_enabled:
                await _record_blocked_query(db, user, conversation, request_provider, request_model, "token_limit")
                raise HTTPException(503, "The Groq monthly token limit has been reached and automatic fallback is unavailable.")
            request_provider = "ollama"
            request_model = config.fallback_model or config.ollama_model
            fallback_reason = "token_limit"

    if request_provider == "ollama" and manager.latest_health:
        if provider_health(manager.latest_health)["ollama"] != "online":
            await _record_blocked_query(db, user, conversation, request_provider, request_model, "service_unavailable")
            raise HTTPException(503, "The selected local Ollama service is not reachable.")
    try:
        result = await request(
            "POST",
            f"/api/v1/chat/sessions/{conversation.medical_assistant_id}/messages",
            json={
                "patient_id": str(user.id),
                "message": payload.message,
                "provider": request_provider,
                "groq_model": request_model if request_provider == "groq" else config.groq_model,
                "ollama_model": config.fallback_model if request_provider == "groq" else request_model,
                "auto_fallback": config.auto_fallback_enabled and request_provider == "groq",
            },
        )
    except MedicalAssistantError as exc:
        failed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        db.add(ModelUsage(patient_id=user.id, conversation_id=conversation.id, provider=request_provider, model=request_model or "", success=False, status="error", error_type="service_unavailable", response_time_ms=failed_ms, latency_ms=failed_ms))
        db.commit()
        state = build_initial_state(db, manager.latest_health or {"available": False, "status": None})
        await manager.broadcast("query_completed", {"usage": state["usage"], "model": None})
        raise HTTPException(503, str(exc)) from exc

    usage = result.get("usage") or {}
    response_ms = int(result.get("response_time_ms") or (datetime.now(timezone.utc) - started).total_seconds() * 1000)
    provider = result.get("provider") or "none"
    model = result.get("model") or request_model or ""
    usage_provider = request_provider if provider == "none" else provider
    was_fallback = bool(result.get("fallback_used")) or fallback_reason is not None
    fallback_reason = result.get("fallback_reason") or fallback_reason
    result["fallback_used"] = was_fallback
    result["fallback_reason"] = fallback_reason
    db.add(ChatMessage(conversation_id=conversation.id, role="assistant", content=result.get("answer", ""), structured=result.get("structured")))
    db.add(ModelUsage(
        patient_id=user.id,
        conversation_id=conversation.id,
        provider=usage_provider,
        model=model,
        prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
        completion_tokens=int(usage.get("completion_tokens", 0) or 0),
        total_tokens=int(usage.get("total_tokens", 0) or 0),
        tokens_in=int(usage.get("prompt_tokens", 0) or 0),
        tokens_out=int(usage.get("completion_tokens", 0) or 0),
        response_time_ms=response_ms,
        latency_ms=response_ms,
        fallback_used=was_fallback,
        was_fallback=was_fallback,
        success=provider != "none",
        status="success" if provider != "none" else "error",
        fallback_reason=fallback_reason,
        error_type=None if provider != "none" else "model_error",
    ))
    if was_fallback and provider == "ollama" and config.auto_fallback_enabled:
        # Sticky automatic failover: future turns use the local provider until
        # an administrator explicitly selects Groq again.
        config.primary_provider = "ollama"
        config.ollama_model = model
        config.fallback_active = True
        config.last_fallback_reason = fallback_reason or "api_error"
        config.last_fallback_at = datetime.now(timezone.utc)
    conversation.title = (payload.message.strip()[:60] if conversation.title == "New conversation" else conversation.title)
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    state = build_initial_state(db, manager.latest_health or {"available": False, "status": None})
    model_row = next((item for item in state["models"] if item["provider"] == usage_provider and item["model"] == model), None)
    await manager.broadcast("query_completed", {"usage": state["usage"], "model": model_row})
    if was_fallback and provider == "ollama":
        fallback_event = {"reason": fallback_reason or "api_error", "at": config.last_fallback_at.isoformat() if config.last_fallback_at else datetime.now(timezone.utc).isoformat(), "active_model": state["active_model"], "usage": state["usage"]}
        await manager.broadcast("fallback_triggered", fallback_event)
        await manager.broadcast("model_changed", {"active_model": state["active_model"], "config": state["config"]})
    return result


@router.get("/admin/chatbot/monitoring")
async def chatbot_monitoring(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """Return the current live chatbot model, provider and usage snapshot."""
    _config, health, _providers = await _chat_config(db)
    return build_initial_state(db, health)


@router.put("/admin/chatbot/model")
async def update_chatbot_model(
    payload: ModelSelection,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Update the legacy model-selection endpoint and record its audit event."""
    config, health, providers = await _chat_config(db)
    if not health["available"]:
        raise HTTPException(503, "Medical Assistant service is unavailable")
    provider_enabled = config.groq_enabled if payload.primary_provider == "groq" else config.ollama_enabled
    if not provider_enabled:
        raise HTTPException(409, "The selected provider is disabled by an administrator")
    if payload.auto_fallback_enabled and (not config.ollama_enabled or providers["ollama"]["status"] != "online"):
        raise HTTPException(409, "Automatic fallback requires an enabled, reachable Ollama model")
    if payload.primary_provider == "ollama" and providers["ollama"]["status"] != "online":
        raise HTTPException(409, "No local Ollama model is currently available")
    if payload.primary_provider == "groq" and providers["groq"]["status"] != "online":
        raise HTTPException(409, "GroqCloud is not currently available")
    if payload.groq_model and payload.groq_model not in providers["groq"]["models"]:
        raise HTTPException(422, "Selected Groq model is not available")
    if payload.ollama_model and payload.ollama_model not in providers["ollama"]["models"]:
        raise HTTPException(422, "Selected Ollama model is not available")
    old = {"primary_provider": config.primary_provider, "groq_model": config.groq_model, "ollama_model": config.ollama_model, "fallback_model": config.fallback_model, "monthly_token_limit": config.monthly_token_limit, "auto_fallback_enabled": config.auto_fallback_enabled, "fallback_active": config.fallback_active}
    config.primary_provider = payload.primary_provider
    if payload.groq_model:
        config.groq_model = payload.groq_model
    if payload.ollama_model:
        config.ollama_model = payload.ollama_model
    if payload.monthly_token_limit is not None:
        config.monthly_token_limit = payload.monthly_token_limit
    if payload.auto_fallback_enabled is not None:
        config.auto_fallback_enabled = payload.auto_fallback_enabled
    config.fallback_active = False
    new = {"primary_provider": config.primary_provider, "groq_model": config.groq_model, "ollama_model": config.ollama_model, "fallback_model": config.fallback_model, "monthly_token_limit": config.monthly_token_limit, "auto_fallback_enabled": config.auto_fallback_enabled, "fallback_active": config.fallback_active}
    write_audit(db, user.id, "chatbot_settings_changed", "chatbot", old, new)
    db.commit()
    db.refresh(config)
    state = build_initial_state(db, health)
    await manager.broadcast("model_changed", {"active_model": state["active_model"], "config": state["config"]})
    await manager.broadcast("settings_changed", {"config": state["config"], "usage": state["usage"]})
    if old["fallback_active"] and not config.fallback_active:
        await manager.broadcast("fallback_cleared", {"active_model": state["active_model"], "config": state["config"]})
    return state["config"]
