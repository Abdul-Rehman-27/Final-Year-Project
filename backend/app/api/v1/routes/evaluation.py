import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.evaluation import BenchmarkQuery, EvaluationRun, utcnow
from app.models.user import User
from app.schemas.evaluation import BenchmarkQueryIn, EvaluationRunIn
from app.services.evaluation import RUN_TASKS, available_models, launch_run, query_dict, run_dict
from app.services.chatbot_admin import write_audit

router = APIRouter(prefix="/admin/evaluation", tags=["admin evaluation"], dependencies=[Depends(require_roles("admin"))])


@router.get("/queries")
def list_queries(db: Session = Depends(get_db)):
    return [query_dict(row) for row in db.scalars(select(BenchmarkQuery).order_by(BenchmarkQuery.id)).all()]


@router.post("/queries", status_code=status.HTTP_201_CREATED)
def create_query(payload: BenchmarkQueryIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    row = BenchmarkQuery(**payload.model_dump())
    db.add(row)
    db.flush()
    write_audit(db, user.id, "benchmark_query_created", f"benchmark-query:{row.id}", {}, payload.model_dump())
    db.commit()
    db.refresh(row)
    return query_dict(row)


@router.put("/queries/{query_id}")
def update_query(query_id: int, payload: BenchmarkQueryIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    row = db.get(BenchmarkQuery, query_id)
    if row is None:
        raise HTTPException(404, "Benchmark query not found.")
    old = {key: getattr(row, key) for key in payload.model_dump()}
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    write_audit(db, user.id, "benchmark_query_updated", f"benchmark-query:{row.id}", old, payload.model_dump())
    db.commit()
    db.refresh(row)
    return query_dict(row)


@router.delete("/queries/{query_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_query(query_id: int, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    row = db.get(BenchmarkQuery, query_id)
    if row is None:
        raise HTTPException(404, "Benchmark query not found.")
    old = query_dict(row)
    db.delete(row)
    write_audit(db, user.id, "benchmark_query_deleted", f"benchmark-query:{query_id}", old, {})
    db.commit()


@router.get("/models")
async def list_evaluation_models():
    return await available_models()


@router.get("/runs")
def list_runs(db: Session = Depends(get_db)):
    return [run_dict(run) for run in db.scalars(select(EvaluationRun).order_by(EvaluationRun.created_at.desc())).all()]


@router.post("/runs", status_code=status.HTTP_201_CREATED)
async def create_run(payload: EvaluationRunIn, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    active = db.scalar(select(EvaluationRun).where(EvaluationRun.status.in_(["queued", "running"])).order_by(EvaluationRun.id.desc()))
    if active:
        raise HTTPException(409, f"Evaluation run #{active.id} is already active. Cancel or wait for it to finish first.")
    query_count = len(db.scalars(select(BenchmarkQuery.id)).all())
    if not query_count:
        raise HTTPException(409, "Add benchmark queries before starting an evaluation.")
    models = await available_models()
    if payload.model not in models[payload.provider]:
        raise HTTPException(422, "The selected model is not currently available.")
    run = EvaluationRun(provider=payload.provider, model=payload.model, status="queued", total_queries=query_count,
                        results=[], summarizer={"rougeL": None, "coverage": None, "allergyRecall": None})
    db.add(run)
    db.commit()
    db.refresh(run)
    write_audit(db, user.id, "evaluation_started", f"evaluation-run:{run.id}", {}, {"provider": payload.provider, "model": payload.model, "total_queries": query_count})
    db.commit()
    launch_run(run.id, payload.provider, payload.model)
    return run_dict(run)


@router.get("/runs/{run_id}")
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(EvaluationRun, run_id)
    if run is None:
        raise HTTPException(404, "Evaluation run not found.")
    return run_dict(run)


@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(run_id: int, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """Delete one saved evaluation report; a run must be stopped before deletion."""
    run = db.get(EvaluationRun, run_id)
    if run is None:
        raise HTTPException(404, "Evaluation report not found.")
    active_task = RUN_TASKS.get(run_id)
    if run.status in {"queued", "running"} or (active_task is not None and not active_task.done()):
        raise HTTPException(409, "Stop the evaluation before deleting its report.")
    audit_data = {"provider": run.provider, "model": run.model, "status": run.status,
                  "completed_queries": run.completed_queries, "total_queries": run.total_queries}
    db.delete(run)
    write_audit(db, user.id, "evaluation_report_deleted", f"evaluation-run:{run_id}", audit_data, {})
    db.commit()


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: int, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    run = db.get(EvaluationRun, run_id)
    if run is None:
        raise HTTPException(404, "Evaluation run not found.")
    if run.status not in {"queued", "running"}:
        raise HTTPException(409, f"Run is already {run.status}.")
    task = RUN_TASKS.get(run_id)
    if task and not task.done():
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    else:
        run.status = "cancelled"
        run.finished_at = utcnow()
        run.current_query = ""
        run.current_query_started_at = None
        run.error = None
        db.commit()
    db.refresh(run)
    write_audit(db, user.id, "evaluation_cancelled", f"evaluation-run:{run.id}", {}, {"status": run.status, "completed_queries": run.completed_queries})
    db.commit()
    return run_dict(run)


@router.post("/runs/{run_id}/resume")
async def resume_run(run_id: int, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    run = db.get(EvaluationRun, run_id)
    if run is None:
        raise HTTPException(404, "Evaluation run not found.")
    if run.status not in {"cancelled", "failed"}:
        raise HTTPException(409, "Only cancelled or failed runs can be resumed.")
    if (task := RUN_TASKS.get(run_id)) and not task.done():
        raise HTTPException(409, "The previous run task is still stopping.")
    models = await available_models()
    if run.model not in models.get(run.provider, []):
        raise HTTPException(422, "The run's model is currently unavailable.")
    run.status = "queued"
    run.error = None
    run.finished_at = None
    run.current_query = ""
    run.current_query_started_at = None
    db.commit()
    db.refresh(run)
    write_audit(db, user.id, "evaluation_resumed", f"evaluation-run:{run.id}", {"status": "failed or cancelled", "completed_queries": run.completed_queries}, {"status": "queued", "provider": run.provider, "model": run.model})
    db.commit()
    launch_run(run.id, run.provider, run.model)
    return run_dict(run)
