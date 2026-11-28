"""Patient portal schema upgrade (idempotent; safe on existing PostgreSQL and SQLite databases)."""
from sqlalchemy import inspect, text

from app.db.session import Base


def _add_column(conn, insp, table, column, ddl):
    if column not in {c["name"] for c in insp.get_columns(table)}:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def upgrade(engine):
    Base.metadata.create_all(bind=engine)
    insp = inspect(engine)
    with engine.begin() as conn:
        _add_column(conn, insp, "portal_hospital_settings", "emergency_number", "VARCHAR(50) DEFAULT ''")
        _add_column(conn, insp, "portal_lab_reports", "technique", "TEXT DEFAULT ''")
        _add_column(conn, insp, "portal_lab_reports", "performed_at", "TIMESTAMP" if engine.dialect.name == "sqlite" else "TIMESTAMP WITH TIME ZONE")
        # Patient-booked tests have no requesting doctor. SQLite cannot ALTER NOT NULL; fresh SQLite DBs already get the nullable column.
        if engine.dialect.name == "postgresql":
            conn.execute(text("ALTER TABLE portal_lab_reports ALTER COLUMN requested_by_doctor_id DROP NOT NULL"))
        # One active appointment per doctor per slot (prevents double booking under concurrency).
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_active_slot ON portal_appointments (doctor_id, starts_at) "
            "WHERE status IN ('pending','confirmed')"))
