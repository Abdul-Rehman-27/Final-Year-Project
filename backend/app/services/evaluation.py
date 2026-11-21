import asyncio
import re
import time
from datetime import timezone

from fastapi import HTTPException
from sqlalchemy import select
from app.models.evaluation import BenchmarkQuery, EvaluationRun
from app.db.session import SessionLocal
from app.services.medical_assistant_client import MedicalAssistantError, request
from app.models.evaluation import utcnow

RUN_TASKS: dict[int, asyncio.Task] = {}


def launch_run(run_id: int, provider: str, model: str):
    task = asyncio.create_task(run_evaluation_background(run_id, provider, model))
    RUN_TASKS[run_id] = task

    def remove_task(done_task):
        if RUN_TASKS.get(run_id) is done_task:
            RUN_TASKS.pop(run_id, None)

    task.add_done_callback(remove_task)
    return task


def normalized(value: str) -> str:
    return " ".join(re.sub(r"[^\w\u0600-\u06ff]+", " ", value.casefold()).split())


def rouge_l(reference: str, prediction: str) -> float:
    left, right = normalized(reference).split(), normalized(prediction).split()
    if not left or not right:
        return 0.0
    previous = [0] * (len(right) + 1)
    for token in left:
        current = [0]
        for index, other in enumerate(right, 1):
            current.append(previous[index - 1] + 1 if token == other else max(previous[index], current[-1]))
        previous = current
    lcs = previous[-1]
    precision, recall = lcs / len(right), lcs / len(left)
    return round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0.0


def query_dict(row: BenchmarkQuery) -> dict:
    return {"id": row.id, "lang": row.lang, "category": row.category, "query": row.query, "truth": row.truth}


def run_dict(run: EvaluationRun) -> dict:
    created = run.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return {"id": run.id, "createdAt": created.isoformat(), "provider": run.provider, "model": run.model,
            "results": run.results, "summarizer": run.summarizer, "status": run.status,
            "totalQueries": run.total_queries, "completedQueries": run.completed_queries,
            "currentQuery": run.current_query, "startedAt": run.started_at.isoformat() if run.started_at else None,
            "currentQueryStartedAt": run.current_query_started_at.isoformat() if run.current_query_started_at else None,
            "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
            "durationMs": run.duration_ms, "error": run.error}


async def available_models() -> dict:
    try:
        health = await request("GET", "/api/v1/health")
    except MedicalAssistantError as exc:
        raise HTTPException(503, "Medical Assistant model service is unavailable.") from exc
    models = health.get("models", {})
    primary = models.get("primary", {})
    fallback = models.get("fallback", {})
    return {
        "groq": primary.get("models", []) if primary.get("connected") else [],
        "ollama": fallback.get("models", []) if fallback.get("connected") else [],
    }


async def run_evaluation_background(run_id: int, provider: str, model: str):
    """Run queries serially and persist each answer so the admin UI can poll live progress."""
    db = SessionLocal()
    started = time.monotonic()
    base_duration_ms = 0
    try:
        run = db.get(EvaluationRun, run_id)
        if run is None or run.status not in {"queued", "running"}:
            return
        queries = db.scalars(select(BenchmarkQuery).order_by(BenchmarkQuery.id)).all()
        # Older runs could save an empty answer as completed; discard those rows when resuming.
        run.results = [result for result in (run.results or []) if str(result.get("predicted", "")).strip()]
        labels_by_category: dict[str, list[str]] = {}
        for item in queries:
            labels_by_category.setdefault(item.category, [])
            if item.truth not in labels_by_category[item.category]:
                labels_by_category[item.category].append(item.truth)
        completed_ids = {result.get("queryId") for result in run.results}
        run.completed_queries = len(completed_ids)
        run.status = "running"
        run.total_queries = max(run.total_queries, len(queries) + len(completed_ids - {item.id for item in queries}))
        run.started_at = utcnow()
        base_duration_ms = run.duration_ms or 0
        db.commit()

        for item in queries:
            if item.id in completed_ids:
                continue
            query_started = time.monotonic()
            run.current_query = item.query
            run.current_query_started_at = utcnow()
            db.commit()
            try:
                reply = await request("POST", "/api/v1/evaluation/respond", json={
                    "query": item.query, "language": item.lang, "category": item.category,
                    "provider": provider, "model": model, "labels": labels_by_category[item.category],
                }, timeout=None)
            except MedicalAssistantError as exc:
                run.status = "failed"
                run.error = f"The selected model could not answer query {item.id}: {exc}"
                run.finished_at = utcnow()
                run.duration_ms = base_duration_ms + round((time.monotonic() - started) * 1000)
                db.commit()
                return
            predicted = (reply.get("answer") or "").strip()
            duration_ms = round((time.monotonic() - query_started) * 1000)
            if not predicted or reply.get("finish_reason") == "length":
                reason = "empty response" if not predicted else "response was cut off by the output limit"
                run.status = "failed"
                run.error = f"Query {item.id} returned {reason}; it was not recorded. Resume the run to retry it."
                run.finished_at = utcnow()
                run.duration_ms = base_duration_ms + round((time.monotonic() - started) * 1000)
                db.commit()
                return
            run.results = [*run.results, {
                "queryId": item.id, "lang": item.lang, "category": item.category,
                "query": item.query, "truth": item.truth, "predicted": predicted,
                "modelResponse": reply.get("model_response") or predicted,
                "explanation": reply.get("explanation") or "",
                "confidence": reply.get("confidence"),
                "confidenceCandidates": reply.get("confidence_candidates") or [],
                "correct": normalized(predicted) == normalized(item.truth),
                "rougeL": rouge_l(item.truth, predicted), "durationMs": duration_ms,
            }]
            run.completed_queries += 1
            run.duration_ms = base_duration_ms + round((time.monotonic() - started) * 1000)
            db.commit()

        run.status = "completed"
        run.current_query = ""
        run.finished_at = utcnow()
        run.duration_ms = base_duration_ms + round((time.monotonic() - started) * 1000)
        db.commit()
    except asyncio.CancelledError:
        db.rollback()
        run = db.get(EvaluationRun, run_id)
        if run:
            run.status = "cancelled"
            run.current_query = ""
            run.current_query_started_at = None
            run.finished_at = utcnow()
            run.error = None
            run.duration_ms = base_duration_ms + round((time.monotonic() - started) * 1000)
            db.commit()
    except Exception:
        db.rollback()
        run = db.get(EvaluationRun, run_id)
        if run:
            run.status = "failed"
            run.error = "An unexpected error interrupted this evaluation."
            run.finished_at = utcnow()
            run.duration_ms = base_duration_ms + round((time.monotonic() - started) * 1000)
            db.commit()
    finally:
        db.close()
