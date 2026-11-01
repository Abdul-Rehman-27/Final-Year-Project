import csv
import io
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.chatbot import ModelConfig
from app.models.user import User
from app.schemas.chatbot import AdminSettingsUpdate, ServiceToggle
from app.services.chatbot_admin import (
    build_initial_state,
    get_model_config,
    list_models,
    model_usage,
    parse_model_id,
    provider_health,
    write_audit,
)
from app.services.websocket_manager import manager

router = APIRouter(prefix="/admin", tags=["admin chatbot"])


async def _state(db: Session) -> tuple[ModelConfig, dict, dict]:
    """Load saved settings and the server's latest health-check result."""
    config = get_model_config(db)
    health = manager.latest_health or {"available": False, "status": None}
    local_models = provider_health(health)["models"]["ollama"]
    if local_models:
        if not config.fallback_model:
            config.fallback_model = local_models[0]
        if not config.ollama_model:
            config.ollama_model = config.fallback_model
        db.commit()
    return config, health, build_initial_state(db, health)


@router.get("/models")
async def get_admin_models(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """List available models with live health and recent usage."""
    config, health, state = await _state(db)
    return {
        "models": list_models(db, config, health),
        "services": state["services"],
        "providers": state["providers"],
        "config": state["config"],
        "active_model": state["active_model"],
    }


@router.get("/models/{model_key}/usage")
async def get_model_usage(
    model_key: str,
    range: Literal["day", "week", "month"] = Query(default="week"),
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Return time-series and totals for one selected model."""
    parsed = parse_model_id(model_key)
    if not parsed:
        raise HTTPException(422, "Invalid model identifier")
    return model_usage(db, *parsed, range)


@router.get("/models/{model_key}/usage/export")
async def export_model_usage(
    model_key: str,
    range: Literal["day", "week", "month"] = Query(default="week"),
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Download a CSV report for one model and range."""
    parsed = parse_model_id(model_key)
    if not parsed:
        raise HTTPException(422, "Invalid model identifier")
    report = model_usage(db, *parsed, range)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["period", "queries", "tokens_in", "tokens_out", "average_response_time_ms", "slowest_response_time_ms", "error_count", "fallback_count"])
    for row in report["series"]:
        writer.writerow([row["period"], row["queries"], row["tokens_in"], row["tokens_out"], row["average_response_time_ms"], row["slowest_response_time_ms"], row["error_count"], row["fallback_count"]])
    output.seek(0)
    provider, name = parsed
    return StreamingResponse(output, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{provider}-{name.replace("/", "-")}-usage.csv"'})


@router.patch("/services/{service_id}")
async def update_service(
    service_id: Literal["medical-assistant", "groqcloud", "ollama"],
    payload: ServiceToggle,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Enable or disable a provider after checking that chat still has a route."""
    config, health, _state_data = await _state(db)
    fields = {"medical-assistant": "medical_assistant_enabled", "groqcloud": "groq_enabled", "ollama": "ollama_enabled"}
    field = fields[service_id]
    old_enabled = getattr(config, field)
    if old_enabled == payload.enabled:
        return {"id": service_id, "enabled": old_enabled, "status": "unchanged"}

    live = provider_health(health)
    if not payload.enabled:
        if service_id == "medical-assistant":
            raise HTTPException(409, "Medical Assistant is the chat gateway. Keep it enabled while patients use the chatbot.")
        if service_id == "groqcloud":
            if not (config.ollama_enabled and live["ollama"] == "online" and config.medical_assistant_enabled):
                raise HTTPException(409, "Cannot disable GroqCloud: no other enabled and reachable chat provider is available.")
            if config.primary_provider == "groq":
                config.primary_provider = "ollama"
                config.ollama_model = config.fallback_model or config.ollama_model
            config.fallback_active = False
            config.auto_fallback_enabled = False
        if service_id == "ollama":
            if not (config.groq_enabled and live["groq"] == "online" and config.medical_assistant_enabled):
                raise HTTPException(409, "Cannot disable Ollama: no other enabled and reachable chat provider is available.")
            if config.primary_provider == "ollama":
                config.primary_provider = "groq"
                config.fallback_active = False
            if config.auto_fallback_enabled:
                config.auto_fallback_enabled = False

    old = {field: old_enabled, "primary_provider": _state_data["config"]["primary_provider"], "auto_fallback_enabled": _state_data["config"]["auto_fallback_enabled"], "fallback_active": _state_data["config"]["fallback_active"]}
    setattr(config, field, payload.enabled)
    db.add(config)
    new = {field: payload.enabled, "primary_provider": config.primary_provider, "auto_fallback_enabled": config.auto_fallback_enabled, "fallback_active": config.fallback_active}
    write_audit(db, user.id, "service_toggled", service_id, old, new)
    db.commit()
    new_state = build_initial_state(db, health)
    await manager.broadcast("service_status_changed", {"service": new_state["service"], "services": new_state["services"], "providers": new_state["providers"]})
    if old["primary_provider"] != config.primary_provider:
        await manager.broadcast("model_changed", {"active_model": new_state["active_model"], "config": new_state["config"]})
    if old["auto_fallback_enabled"] != config.auto_fallback_enabled:
        await manager.broadcast("settings_changed", {"config": new_state["config"]})
    if old["fallback_active"] and not config.fallback_active:
        await manager.broadcast("fallback_cleared", {"active_model": new_state["active_model"], "config": new_state["config"]})
    return next(service for service in new_state["services"] if service["id"] == service_id)


@router.patch("/settings")
async def update_admin_settings(
    payload: AdminSettingsUpdate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Save model, fallback and quota settings after validating live availability."""
    config, health, _state_data = await _state(db)
    live = provider_health(health)
    if not config.medical_assistant_enabled:
        raise HTTPException(409, "Medical Assistant is disabled.")
    if payload.primary_provider == "groq":
        if not config.groq_enabled or live["groq"] != "online":
            raise HTTPException(409, "GroqCloud must be enabled and reachable to select it.")
        available = live["models"]["groq"]
        if payload.active_model not in available:
            raise HTTPException(422, "The selected Groq model is not available.")
        if payload.auto_fallback_enabled and (not config.ollama_enabled or live["ollama"] != "online"):
            raise HTTPException(409, "Enable an available Ollama model before turning on automatic fallback.")
    else:
        if not config.ollama_enabled or live["ollama"] != "online":
            raise HTTPException(409, "Ollama must be enabled and reachable to select it.")
        if payload.active_model not in live["models"]["ollama"]:
            raise HTTPException(422, "The selected Ollama model is not available.")
    if payload.auto_fallback_enabled:
        if not config.groq_enabled or live["groq"] != "online":
            raise HTTPException(409, "Automatic fallback requires an enabled, reachable GroqCloud primary provider.")
        if payload.fallback_model not in live["models"]["ollama"]:
            raise HTTPException(422, "The selected fallback model is not available in Ollama.")
        if not config.ollama_enabled:
            raise HTTPException(409, "Ollama is disabled. Enable it before turning on automatic fallback.")

    old = {"primary_provider": config.primary_provider, "groq_model": config.groq_model, "ollama_model": config.ollama_model, "fallback_model": config.fallback_model, "auto_fallback_enabled": config.auto_fallback_enabled, "fallback_active": config.fallback_active, "monthly_token_limit": config.monthly_token_limit}
    config.primary_provider = payload.primary_provider
    if payload.primary_provider == "groq":
        config.groq_model = payload.active_model
    else:
        config.ollama_model = payload.active_model
    config.fallback_model = payload.fallback_model
    config.auto_fallback_enabled = payload.auto_fallback_enabled
    config.fallback_active = False
    config.monthly_token_limit = payload.monthly_token_limit
    new = {"primary_provider": config.primary_provider, "groq_model": config.groq_model, "ollama_model": config.ollama_model, "fallback_model": config.fallback_model, "auto_fallback_enabled": config.auto_fallback_enabled, "fallback_active": config.fallback_active, "monthly_token_limit": config.monthly_token_limit}
    if old == new:
        return {"config": new, "status": "unchanged"}
    write_audit(db, user.id, "chatbot_settings_changed", "chatbot", old, new)
    db.add(config)
    db.commit()
    db.refresh(config)
    _config, _new_health, state = await _state(db)
    if old["primary_provider"] != new["primary_provider"] or old["groq_model"] != new["groq_model"] or old["ollama_model"] != new["ollama_model"] or old["fallback_model"] != new["fallback_model"]:
        await manager.broadcast("model_changed", {"active_model": state["active_model"], "config": state["config"]})
    await manager.broadcast("settings_changed", {"config": state["config"], "usage": state["usage"]})
    if old["fallback_active"] and not config.fallback_active:
        await manager.broadcast("fallback_cleared", {"active_model": state["active_model"], "config": state["config"]})
    return {"config": state["config"], "active_model": state["active_model"]}


@router.post("/fallback/return-to-primary")
async def return_to_primary(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """Switch from the local fallback model back to GroqCloud."""
    config, health, _state_data = await _state(db)
    live = provider_health(health)
    if not config.groq_enabled or live["groq"] != "online" or config.groq_model not in live["models"]["groq"]:
        raise HTTPException(409, "GroqCloud is not enabled and reachable, so the primary model cannot be restored.")
    if config.primary_provider == "groq" and not config.fallback_active:
        return {"active_model": _state_data["active_model"], "config": _state_data["config"], "status": "unchanged"}
    old = {"primary_provider": config.primary_provider, "groq_model": config.groq_model, "fallback_active": config.fallback_active}
    config.primary_provider = "groq"
    config.fallback_active = False
    new = {"primary_provider": config.primary_provider, "groq_model": config.groq_model, "fallback_active": config.fallback_active}
    write_audit(db, user.id, "returned_to_primary_model", "chatbot", old, new)
    db.commit()
    state = build_initial_state(db, health)
    await manager.broadcast("model_changed", {"active_model": state["active_model"], "config": state["config"]})
    await manager.broadcast("fallback_cleared", {"active_model": state["active_model"], "config": state["config"]})
    return {"active_model": state["active_model"], "config": state["config"]}


@router.get("/audit-logs")
async def get_admin_audit_logs(limit: int = Query(default=100, ge=1, le=500), user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """List recent changes made to chatbot admin settings."""
    from app.models.chatbot import AdminAuditLog
    from app.models.user import User
    from sqlalchemy import select

    rows = db.execute(select(AdminAuditLog, User.full_name, User.email).join(User, User.id == AdminAuditLog.admin_id).order_by(AdminAuditLog.created_at.desc()).limit(limit)).all()
    return [{"id": audit.id, "admin_id": audit.admin_id, "admin_name": name, "admin_email": email, "action": audit.action, "target": audit.target, "old_value": audit.old_value, "new_value": audit.new_value, "created_at": audit.created_at.isoformat()} for audit, name, email in rows]
