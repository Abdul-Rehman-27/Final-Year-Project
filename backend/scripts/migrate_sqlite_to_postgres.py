"""Copy existing local SQLAlchemy data into an empty PostgreSQL database."""

import os
from datetime import datetime, timezone

from sqlalchemy import create_engine, func, select, text

from app import models  # noqa: F401 - register all mapped tables
from app.core.config import settings
from app.db.migrations.v001_chatbot_admin import upgrade
from app.db.session import Base


def migrate() -> None:
    """Preserve existing users and chatbot records when changing databases."""
    sqlite_url = os.getenv("SQLITE_SOURCE_URL", "sqlite:///./dev.db")
    sqlite = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    postgres = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

    if postgres.dialect.name != "postgresql":
        raise RuntimeError("DATABASE_URL must point to PostgreSQL before running this migration.")

    # Apply the same idempotent schema upgrade to both database schemas first.
    upgrade(sqlite)
    upgrade(postgres)

    with sqlite.connect() as source, postgres.begin() as target:
        for table in Base.metadata.sorted_tables:
            target_rows = target.execute(select(func.count()).select_from(table)).scalar_one()
            if target_rows:
                raise RuntimeError(f"PostgreSQL table {table.name} is not empty; refusing to duplicate records.")

            source_rows = source.execute(select(table)).mappings().all()
            if source_rows:
                rows = []
                for source_row in source_rows:
                    row = dict(source_row)
                    for name, value in row.items():
                        if isinstance(value, datetime) and value.tzinfo is None:
                            row[name] = value.replace(tzinfo=timezone.utc)
                    rows.append(row)
                target.execute(table.insert(), rows)

            # Explicitly copied IDs need their PostgreSQL sequences moved forward.
            primary_key = table.autoincrement_column
            if primary_key is not None:
                table_name = table.name.replace('"', '""')
                column_name = primary_key.name.replace('"', '""')
                target.execute(text(
                    f'SELECT setval(pg_get_serial_sequence(\'{table_name}\', \'{column_name}\'), '
                    f'COALESCE(MAX("{column_name}"), 1), MAX("{column_name}") IS NOT NULL) '
                    f'FROM "{table_name}"'
                ))

            print(f"{table.name}: copied {len(source_rows)} rows")

    sqlite.dispose()
    postgres.dispose()


if __name__ == "__main__":
    migrate()
