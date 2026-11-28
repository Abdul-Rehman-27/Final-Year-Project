"""Hospital Profile: structured operating hours + optional lab-hours override (idempotent)."""
from sqlalchemy import inspect, text

from app.db.session import Base


def _add_column(conn, insp, column, ddl):
    if column not in {c["name"] for c in insp.get_columns("portal_hospital_settings")}:
        conn.execute(text(f"ALTER TABLE portal_hospital_settings ADD COLUMN {column} {ddl}"))


def upgrade(engine):
    Base.metadata.create_all(bind=engine)
    insp = inspect(engine)
    true = "1" if engine.dialect.name == "sqlite" else "TRUE"
    with engine.begin() as conn:
        _add_column(conn, insp, "open_24h", f"BOOLEAN DEFAULT {true}")   # existing rows keep the old "Open 24 hours" default
        for column in ("opens_at", "closes_at", "lab_opens_at", "lab_closes_at"):
            _add_column(conn, insp, column, "VARCHAR(5)")
