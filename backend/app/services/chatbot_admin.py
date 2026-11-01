import base64
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.chatbot import AdminAuditLog, ModelConfig, ModelUsage


def get_model_config(db: Session) -> ModelConfig:
    """Return the single chatbot settings row, creating its defaults if needed."""
    config = db.get(ModelConfig, 1)
    if config is None:
        config = ModelConfig(id=1, monthly_token_limit=settings.GROQ_MONTHLY_TOKEN_LIMIT)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def model_id(provider: str, name: str) -> str:
    """Create a URL-safe key for a provider/model pair."""
    raw = f"{provider}:{name}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def parse_model_id(value: str) -> tuple[str, str] | None:
    """Decode a model key from an admin API route."""
    try:
        padding = "=" * (-len(value) % 4)
        provider, name = base64.urlsafe_b64decode(value + padding).decode().split(":", 1)
        if provider not in {"groq", "ollama"} or not name:
            return None
        return provider, name
    except (ValueError, UnicodeDecodeError):
        return None


def provider_health(health: dict) -> dict:
    """Normalize the Medical Assistant health response for admin pages."""
    body = health.get("status") or {}
    models = body.get("models", {})
    groq = models.get("primary", {})
    ollama = models.get("fallback", {})
    return {
        "medical-assistant": "online" if health.get("available") else "offline",
        "groq": "online" if groq.get("connected") else "offline",
        "ollama": "online" if ollama.get("connected") else "offline",
        "models": {"groq": groq.get("models", []), "ollama": ollama.get("models", [])},
    }


def service_records(config: ModelConfig, health: dict) -> list[dict]:
    """Combine admin enablement and real reachability for the three services."""
    online = provider_health(health)
    services = [
        ("medical-assistant", "Medical Assistant", config.medical_assistant_enabled),
        ("groqcloud", "GroqCloud", config.groq_enabled),
        ("ollama", "Ollama", config.ollama_enabled),
    ]
    return [
        {
            "id": service_id,
            "name": name,
            "enabled": enabled,
            "online": online["medical-assistant" if service_id == "medical-assistant" else service_id.replace("cloud", "")] == "online",
        }
        for service_id, name, enabled in services
    ]


def _period_counts(db: Session, start: datetime, provider: str | None = None, model: str | None = None) -> dict:
    """Aggregate query, token, latency, failure and fallback totals."""
    query = select(
        func.count(ModelUsage.id),
        func.coalesce(func.sum(ModelUsage.tokens_in), 0),
        func.coalesce(func.sum(ModelUsage.tokens_out), 0),
        func.coalesce(func.avg(ModelUsage.response_time_ms), 0),
        func.coalesce(func.max(ModelUsage.response_time_ms), 0),
        func.coalesce(func.sum(case((ModelUsage.status == "error", 1), else_=0)), 0),
        func.coalesce(func.sum(case((ModelUsage.was_fallback.is_(True), 1), else_=0)), 0),
    ).where(ModelUsage.created_at >= start)
    if provider:
        query = query.where(ModelUsage.provider == provider)
    if model:
        query = query.where(ModelUsage.model == model)
    count, tokens_in, tokens_out, average, slowest, errors, fallbacks = db.execute(query).one()
    return {
        "queries": int(count),
        "tokens_in": int(tokens_in),
        "tokens_out": int(tokens_out),
        "tokens": int(tokens_in + tokens_out),
        "average_response_time_ms": round(float(average)),
        "slowest_response_time_ms": int(slowest),
        "error_count": int(errors),
        "fallback_count": int(fallbacks),
    }


def _utc_periods(now: datetime) -> tuple[datetime, datetime]:
    """Return UTC start times for today and this month."""
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return day, month


def list_models(db: Session, config: ModelConfig, health: dict) -> list[dict]:
    """List available and recently used models with their live usage totals."""
    statuses = provider_health(health)
    now = datetime.now(timezone.utc)
    today, month = _utc_periods(now)
    model_names = {
        ("groq", name) for name in statuses["models"]["groq"]
    } | {
        ("ollama", name) for name in statuses["models"]["ollama"]
    }
    model_names.add(("groq", config.groq_model))
    if config.ollama_model:
        model_names.add(("ollama", config.ollama_model))
    if config.fallback_model:
        model_names.add(("ollama", config.fallback_model))
    used_names = db.execute(select(ModelUsage.provider, ModelUsage.model).distinct()).all()
    model_names.update((provider, name) for provider, name in used_names if provider in {"groq", "ollama"} and name)

    result = []
    for provider, name in sorted(model_names):
        day_stats = _period_counts(db, today, provider, name)
        month_stats = _period_counts(db, month, provider, name)
        last_used = db.scalar(select(func.max(ModelUsage.created_at)).where(ModelUsage.provider == provider, ModelUsage.model == name))
        provider_enabled = config.groq_enabled if provider == "groq" else config.ollama_enabled
        model_online = statuses[provider] == "online" and name in statuses["models"][provider]
        result.append({
            "id": model_id(provider, name),
            "model": name,
            "provider": provider,
            "enabled": provider_enabled,
            "online": model_online,
            "queries": month_stats["queries"],
            "tokens_today": day_stats["tokens"],
            "tokens_this_month": month_stats["tokens"],
            "tokens_in_this_month": month_stats["tokens_in"],
            "tokens_out_this_month": month_stats["tokens_out"],
            "average_response_time_ms": month_stats["average_response_time_ms"],
            "last_used": last_used.isoformat() if last_used else None,
        })
    return result


def build_initial_state(db: Session, health: dict) -> dict:
    """Build the complete state used by the REST page and WebSocket snapshot."""
    config = get_model_config(db)
    now = datetime.now(timezone.utc)
    day, month = _utc_periods(now)
    today_stats = _period_counts(db, day)
    month_stats = _period_counts(db, month)
    groq_month = _period_counts(db, month, "groq")
    all_time = _period_counts(db, datetime(1970, 1, 1, tzinfo=timezone.utc))
    models = list_models(db, config, health)
    last_fallback = db.scalar(select(ModelUsage).where(ModelUsage.was_fallback.is_(True)).order_by(ModelUsage.created_at.desc()).limit(1))
    active_model = config.groq_model if config.primary_provider == "groq" else config.ollama_model
    online = provider_health(health)
    return {
        "service": {"name": "Medical Assistant", "status": online["medical-assistant"]},
        "services": service_records(config, health),
        "providers": {
            "groq": {"status": online["groq"], "models": online["models"]["groq"]},
            "ollama": {"status": online["ollama"], "models": online["models"]["ollama"]},
        },
        "available_models": online["models"],
        "active_model": {"provider": config.primary_provider, "name": active_model, "status": online[config.primary_provider]},
        "usage": {
            "queries_processed": all_time["queries"],
            "queries_today": today_stats["queries"],
            "queries_this_month": month_stats["queries"],
            "tokens_today": today_stats["tokens"],
            "tokens_this_month": month_stats["tokens"],
            "groq_tokens_this_month": groq_month["tokens"],
            "monthly_token_limit": config.monthly_token_limit,
            "monthly_tokens_remaining": max(config.monthly_token_limit - groq_month["tokens"], 0) if config.monthly_token_limit else None,
            "average_response_time_ms": month_stats["average_response_time_ms"],
            "automatic_local_fallback": config.auto_fallback_enabled,
            "fallback_active": config.fallback_active,
            "fallbacks_this_month": month_stats["fallback_count"],
            "last_fallback_reason": config.last_fallback_reason,
            "last_fallback_at": config.last_fallback_at.isoformat() if config.last_fallback_at else None,
        },
        "models": models,
        "config": {
            "primary_provider": config.primary_provider,
            "groq_model": config.groq_model,
            "ollama_model": config.ollama_model,
            "fallback_model": config.fallback_model,
            "monthly_token_limit": config.monthly_token_limit,
            "auto_fallback_enabled": config.auto_fallback_enabled,
            "fallback_active": config.fallback_active,
        },
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }


def model_usage(db: Session, provider: str, model: str, period: str) -> dict:
    """Return totals and a small time series for one model and requested range."""
    now = datetime.now(timezone.utc)
    if period == "day":
        start, step, bucket_format = now - timedelta(hours=24), timedelta(hours=1), "%Y-%m-%dT%H"
    elif period == "week":
        start, step, bucket_format = now - timedelta(days=7), timedelta(days=1), "%Y-%m-%d"
    else:
        start, step, bucket_format = now - timedelta(days=30), timedelta(days=1), "%Y-%m-%d"
    rows = db.scalars(select(ModelUsage).where(ModelUsage.provider == provider, ModelUsage.model == model, ModelUsage.created_at >= start).order_by(ModelUsage.created_at)).all()
    buckets: dict[str, dict] = {}
    for row in rows:
        key = row.created_at.strftime(bucket_format)
        item = buckets.setdefault(key, {"period": key, "queries": 0, "tokens_in": 0, "tokens_out": 0, "response_time_total": 0, "slowest_response_time_ms": 0, "error_count": 0, "fallback_count": 0})
        item["queries"] += 1
        item["tokens_in"] += row.tokens_in
        item["tokens_out"] += row.tokens_out
        item["response_time_total"] += row.response_time_ms
        item["slowest_response_time_ms"] = max(item["slowest_response_time_ms"], row.response_time_ms)
        item["error_count"] += int(row.status == "error")
        item["fallback_count"] += int(row.was_fallback)
    series = [{**item, "average_response_time_ms": round(item["response_time_total"] / item["queries"])} for item in buckets.values()]
    totals = _period_counts(db, start, provider, model)
    return {"provider": provider, "model": model, "range": period, **totals, "series": series}


def write_audit(db: Session, admin_id: int, action: str, target: str, old: dict, new: dict) -> None:
    """Store an administrator change and its before/after values."""
    db.add(AdminAuditLog(admin_id=admin_id, action=action, target=target, old_value=old, new_value=new))
