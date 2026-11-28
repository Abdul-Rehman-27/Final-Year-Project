from sqlalchemy import inspect
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.evaluation import EvaluationRun


def upgrade(engine):
    """Add persisted progress and timing fields to evaluation runs."""
    inspector = inspect(engine)
    if "evaluation_runs" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("evaluation_runs")}
    additions = {
        "status": "VARCHAR(20) NOT NULL DEFAULT 'completed'",
        "total_queries": "INTEGER NOT NULL DEFAULT 0",
        "completed_queries": "INTEGER NOT NULL DEFAULT 0",
        "current_query": "TEXT NOT NULL DEFAULT ''",
        "started_at": "TIMESTAMP WITH TIME ZONE",
        "current_query_started_at": "TIMESTAMP WITH TIME ZONE",
        "finished_at": "TIMESTAMP WITH TIME ZONE",
        "duration_ms": "INTEGER NOT NULL DEFAULT 0",
        "error": "TEXT",
    }
    with engine.begin() as connection:
        for name, definition in additions.items():
            if name not in existing:
                connection.exec_driver_sql(f'ALTER TABLE evaluation_runs ADD COLUMN "{name}" {definition}')
        connection.exec_driver_sql(
            "UPDATE evaluation_runs SET status = 'failed', error = 'The application restarted before this run finished.' "
            "WHERE status IN ('queued', 'running')"
        )
    # Move legacy runs with blank successful responses to failed so admins can resume them.
    with Session(engine) as db:
        completed = db.scalars(select(EvaluationRun).where(EvaluationRun.status == "completed")).all()
        for run in completed:
            results = run.results or []
            if any(not str(result.get("predicted", "")).strip() for result in results):
                run.status = "failed"
                run.error = "This older run contains empty model responses. Resume it to rerun those queries."
                run.completed_queries = sum(bool(str(result.get("predicted", "")).strip()) for result in results)
        db.commit()
