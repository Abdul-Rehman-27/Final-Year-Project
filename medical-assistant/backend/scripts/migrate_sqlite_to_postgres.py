"""Copy standalone Medical Assistant records into its configured PostgreSQL database."""

import sqlite3
from pathlib import Path

from app import db
from app.core import settings


TABLES = ("conversations", "messages", "patient_records", "doctors", "appointments", "summaries")
SEQUENCED_TABLES = ("messages", "patient_records")


def migrate():
    """Copy all existing assistant data, preserving IDs and refusing duplicates."""
    if not settings.MEDICAL_ASSISTANT_DATABASE_URL:
        raise RuntimeError("Set MEDICAL_ASSISTANT_DATABASE_URL before running this migration.")

    source_path = Path(settings.MEDICAL_ASSISTANT_DB)
    source = sqlite3.connect(source_path)
    source.row_factory = sqlite3.Row
    db.initialize()

    try:
        with db.connect() as target:
            target.execute("SET TIME ZONE 'UTC'")
            for table in TABLES:
                count = target.execute(f'SELECT COUNT(*) AS count FROM "{table}"').fetchone()["count"]
                if count:
                    raise RuntimeError(f"PostgreSQL table {table} is not empty; refusing to duplicate records.")

                columns = [row["name"] for row in source.execute(f'PRAGMA table_info("{table}")')]
                rows = source.execute(f'SELECT * FROM "{table}"').fetchall()
                if rows:
                    column_list = ", ".join(f'"{column}"' for column in columns)
                    placeholders = ", ".join("?" for _ in columns)
                    statement = f'INSERT INTO "{table}" ({column_list}) VALUES ({placeholders})'
                    for row in rows:
                        target.execute(statement, tuple(row[column] for column in columns))

                if table in SEQUENCED_TABLES:
                    target.execute(
                        f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                        f"COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM \"{table}\""
                    )
                print(f"{table}: copied {len(rows)} rows")
    finally:
        source.close()


if __name__ == "__main__":
    migrate()
