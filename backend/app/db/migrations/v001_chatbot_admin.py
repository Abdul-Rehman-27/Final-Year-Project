from sqlalchemy import inspect

from app.db.session import Base
from app.models import AdminAuditLog, ChatConversation, ChatMessage, ModelConfig, ModelUsage  # noqa: F401


ADDITIONS = {
    "chat_model_config": {
        "fallback_model": "VARCHAR(160) NOT NULL DEFAULT ''",
        "medical_assistant_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
        "groq_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
        "ollama_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
        "auto_fallback_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
        "fallback_active": "BOOLEAN NOT NULL DEFAULT FALSE",
        "last_fallback_reason": "VARCHAR(80)",
        "last_fallback_at": "TIMESTAMP WITH TIME ZONE",
    },
    "chat_model_usage": {
        "tokens_in": "INTEGER NOT NULL DEFAULT 0",
        "tokens_out": "INTEGER NOT NULL DEFAULT 0",
        "latency_ms": "INTEGER NOT NULL DEFAULT 0",
        "was_fallback": "BOOLEAN NOT NULL DEFAULT FALSE",
        "status": "VARCHAR(20) NOT NULL DEFAULT 'success'",
        "fallback_reason": "VARCHAR(80)",
    },
}


def upgrade(engine):
    """Create chatbot admin tables and add new usage/settings columns once."""
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table, columns in ADDITIONS.items():
            current = {column["name"] for column in inspector.get_columns(table)}
            for name, definition in columns.items():
                if name not in current:
                    connection.exec_driver_sql(f'ALTER TABLE "{table}" ADD COLUMN "{name}" {definition}')
        connection.exec_driver_sql("UPDATE chat_model_usage SET tokens_in = prompt_tokens WHERE tokens_in = 0 AND prompt_tokens > 0")
        connection.exec_driver_sql("UPDATE chat_model_usage SET tokens_out = completion_tokens WHERE tokens_out = 0 AND completion_tokens > 0")
        connection.exec_driver_sql("UPDATE chat_model_usage SET latency_ms = response_time_ms WHERE latency_ms = 0 AND response_time_ms > 0")
        connection.exec_driver_sql("UPDATE chat_model_usage SET was_fallback = fallback_used WHERE fallback_used = TRUE AND was_fallback = FALSE")
        connection.exec_driver_sql("UPDATE chat_model_usage SET status = 'error' WHERE success = FALSE AND status = 'success'")
