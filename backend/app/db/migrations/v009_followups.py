"""Follow-ups (P5d): follow-up/consent columns on appointments + recommendations table (idempotent)."""
from sqlalchemy import inspect, text

from app.db.session import Base


def _add(conn, insp, table, column, ddl):
    if column not in {c["name"] for c in insp.get_columns(table)}:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def upgrade(engine):
    Base.metadata.create_all(bind=engine)          # creates portal_followup_recommendations on old databases
    insp = inspect(engine)
    pg = engine.dialect.name == "postgresql"
    ts = "TIMESTAMP WITH TIME ZONE" if pg else "DATETIME"
    with engine.begin() as conn:
        _add(conn, insp, "portal_appointments", "is_followup", "BOOLEAN NOT NULL DEFAULT FALSE" if pg else "BOOLEAN NOT NULL DEFAULT 0")
        _add(conn, insp, "portal_appointments", "followup_of_appointment_id", "INTEGER")
        _add(conn, insp, "portal_appointments", "created_by_doctor_id", "INTEGER")
        _add(conn, insp, "portal_appointments", "patient_agreed", "BOOLEAN")
        _add(conn, insp, "portal_appointments", "agreed_at", ts)
