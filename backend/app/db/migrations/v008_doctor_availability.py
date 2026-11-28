"""Doctor availability: sessions/breaks on schedule rows, appointment duration + cancellation record,
exceptions / reschedule proposals / notifications tables (idempotent)."""
from sqlalchemy import inspect, text

from app.db.session import Base


def _add(conn, insp, table, column, ddl):
    if column not in {c["name"] for c in insp.get_columns(table)}:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def upgrade(engine):
    Base.metadata.create_all(bind=engine)          # creates the three new tables on old databases
    insp = inspect(engine)
    ts = "TIMESTAMP WITH TIME ZONE" if engine.dialect.name == "postgresql" else "DATETIME"
    with engine.begin() as conn:
        _add(conn, insp, "portal_doctor_schedules", "sessions_json", "JSON")
        _add(conn, insp, "portal_doctor_schedules", "breaks_json", "JSON")
        _add(conn, insp, "portal_appointments", "duration_minutes", "INTEGER")
        _add(conn, insp, "portal_appointments", "cancel_reason", "VARCHAR(500)")
        _add(conn, insp, "portal_appointments", "cancelled_by_role", "VARCHAR(20)")
        _add(conn, insp, "portal_appointments", "cancelled_by_id", "INTEGER")
        _add(conn, insp, "portal_appointments", "cancelled_at", ts)
