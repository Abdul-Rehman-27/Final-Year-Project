from sqlalchemy import inspect


def upgrade(engine):
    """Allow one email per role (for example, separate patient and admin accounts)."""
    inspector = inspect(engine)
    indexes = {index["name"]: index for index in inspector.get_indexes("users")}
    unique_constraints = {item["name"] for item in inspector.get_unique_constraints("users")}

    with engine.begin() as connection:
        # Older versions created this global unique index from email(unique=True, index=True).
        old_email_index = indexes.get("ix_users_email")
        if old_email_index and old_email_index.get("unique"):
            connection.exec_driver_sql("DROP INDEX IF EXISTS ix_users_email")

        # A database created from the updated model may already have this constraint.
        if "uq_users_email_role" not in unique_constraints:
            connection.exec_driver_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_role ON users (email, role)"
            )

        connection.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)")
