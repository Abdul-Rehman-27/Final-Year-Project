import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from app.core import settings


class PostgreSQLConnection:
    """Keep the service's simple execute calls compatible with PostgreSQL."""

    is_postgres = True

    def __init__(self, connection):
        self.connection = connection

    def execute(self, statement, parameters=()):
        """Run a query with the question-mark placeholders used by this service."""
        from psycopg2.extras import DictCursor

        cursor = self.connection.cursor(cursor_factory=DictCursor)
        cursor.execute(statement.replace("?", "%s"), parameters)
        return cursor

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()


@contextmanager
def connect():
    """Use shared PostgreSQL when configured, or keep SQLite for standalone demos."""
    if settings.MEDICAL_ASSISTANT_DATABASE_URL:
        import psycopg2

        url = settings.MEDICAL_ASSISTANT_DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://", 1)
        connection = PostgreSQLConnection(psycopg2.connect(url))
    else:
        path = Path(settings.MEDICAL_ASSISTANT_DB)
        path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(path, timeout=15)
        connection.row_factory = sqlite3.Row

    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _initialize_postgres():
    """Create the Medical Assistant tables in the configured PostgreSQL DB."""
    statements = [
        "CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'New conversation', state TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE INDEX IF NOT EXISTS idx_conversations_patient ON conversations(patient_id, updated_at)",
        "CREATE TABLE IF NOT EXISTS messages (id BIGSERIAL PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), role TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, structured TEXT)",
        "CREATE TABLE IF NOT EXISTS patient_records (id BIGSERIAL PRIMARY KEY, patient_id TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE INDEX IF NOT EXISTS idx_records_patient ON patient_records(patient_id, category)",
        "CREATE TABLE IF NOT EXISTS doctors (id TEXT PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL, hospital TEXT NOT NULL, availability TEXT NOT NULL DEFAULT '[]')",
        "CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, doctor_id TEXT NOT NULL, slot TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'booked', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(doctor_id, slot))",
        "CREATE TABLE IF NOT EXISTS summaries (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL DEFAULT '', fields TEXT NOT NULL, source_name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS structured TEXT",
    ]
    with connect() as connection:
        connection.execute("SET TIME ZONE 'UTC'")
        for statement in statements:
            connection.execute(statement)


def initialize():
    """Create the service schema and add the saved structured-reply field."""
    if settings.MEDICAL_ASSISTANT_DATABASE_URL:
        _initialize_postgres()
        return

    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'New conversation', state TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE INDEX IF NOT EXISTS idx_conversations_patient ON conversations(patient_id, updated_at);
        CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(conversation_id) REFERENCES conversations(id));
        CREATE TABLE IF NOT EXISTS patient_records (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE INDEX IF NOT EXISTS idx_records_patient ON patient_records(patient_id, category);
        CREATE TABLE IF NOT EXISTS doctors (id TEXT PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL, hospital TEXT NOT NULL, availability TEXT NOT NULL DEFAULT '[]');
        CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, doctor_id TEXT NOT NULL, slot TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'booked', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(doctor_id, slot));
        CREATE TABLE IF NOT EXISTS summaries (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL DEFAULT '', fields TEXT NOT NULL, source_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        """)
        # Older SQLite databases do not have this column yet, so add it once.
        try:
            db.execute("ALTER TABLE messages ADD COLUMN structured TEXT")
        except sqlite3.OperationalError:
            pass


def row_dict(row):
    """Convert either database row type to a plain dictionary."""
    return dict(row) if row else None


def json_value(value, fallback):
    """Decode saved JSON text and use a fallback if it is missing or invalid."""
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback
