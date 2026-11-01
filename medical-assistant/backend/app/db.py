import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from app.core import settings


@contextmanager
def connect():
    path = Path(settings.MEDICAL_ASSISTANT_DB)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def initialize():
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
        # Older databases do not have this column yet, so add it once.
        try:
            db.execute("ALTER TABLE messages ADD COLUMN structured TEXT")
        except sqlite3.OperationalError:
            pass


def row_dict(row):
    return dict(row) if row else None


def json_value(value, fallback):
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback