"""Chat reply-to: optional text of the assistant message a patient message replies to (idempotent)."""
from sqlalchemy import inspect, text


def upgrade(engine):
    insp = inspect(engine)
    if "chat_messages" not in insp.get_table_names():
        return  # table is created fresh (with the column) by Base.metadata.create_all
    if "reply_to" not in {c["name"] for c in insp.get_columns("chat_messages")}:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE chat_messages ADD COLUMN reply_to VARCHAR(300)"))
