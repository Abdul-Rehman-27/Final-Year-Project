"""Doctor availability exceptions + appointment protection endpoints (prefix /api/v1/doctor).

Errors: {"detail": CODE}. 422 SCHEDULE_INVALID (schedule/exception bodies) / VALIDATION_ERROR, 404 NOT_FOUND,
409 SCHEDULE_CONFLICT (+ "appointments":[appointment_row]) | APPOINTMENT_LOCKED | SLOT_UNAVAILABLE | PATIENT_OVERLAP | INVALID_TRANSITION.
"""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.v1.routes.doctor import DoctorRoute, appointment_ar, fail
from app.db.session import get_db
from app.models.portal import PortalAppointment, PortalRescheduleProposal, PortalScheduleException
from app.models.user import User
from app.services import appointment_changes as ac
from app.services import availability as av
from app.services.portal_core import KARACHI, iso

router = APIRouter(prefix="/doctor", tags=["doctor availability"], dependencies=[Depends(require_roles("doctor"))], route_class=DoctorRoute)


def today() -> date:
    return datetime.now(KARACHI).date()


def day_or_422(text, *, future=True) -> date:
    try:
        d = date.fromisoformat(text)
    except (TypeError, ValueError):
        fail(422, "SCHEDULE_INVALID")
    if future and d < today():
        fail(422, "SCHEDULE_INVALID")           # exceptions are for today onward
    return d


async def json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        fail(422, "SCHEDULE_INVALID")
    if not isinstance(body, dict):
        fail(422, "SCHEDULE_INVALID")
    return body


def note_of(body) -> str:
    n = body.get("note", "")
    if not isinstance(n, str) or len(n) > 200:
        fail(422, "SCHEDULE_INVALID")
    return n.strip()


def conflict(db, bad):
    return JSONResponse(status_code=409, content={"detail": "SCHEDULE_CONFLICT", "appointments": [appointment_ar(db, a) for a in bad]})


def upsert(db, doctor_id, d, value, note):
    row = db.scalar(select(PortalScheduleException).where(PortalScheduleException.doctor_id == doctor_id, PortalScheduleException.day == d))
    if not row:
        row = PortalScheduleException(doctor_id=doctor_id, day=d); db.add(row)
    row.kind, row.sessions_json, row.breaks_json, row.note = value[0], value[1], value[2], note
    return row


# ---------------------------------------------------------------- exceptions
@router.get("/schedule/exceptions")
def list_exceptions(from_: str | None = Query(None, alias="from"), to: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lo = day_or_422(from_, future=False) if from_ else today()
    q = select(PortalScheduleException).where(PortalScheduleException.doctor_id == user.id, PortalScheduleException.day >= lo)
    if to:
        q = q.where(PortalScheduleException.day <= day_or_422(to, future=False))
    return {"items": [av.exception_dict(e) for e in db.scalars(q.order_by(PortalScheduleException.day)).all()]}


@router.put("/schedule/exceptions/{day}")
async def put_exception(day: str, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = day_or_422(day); body = await json_body(request); note = note_of(body)
    old = av.load(db, user.id)
    try:
        sessions = av.clean_sessions(body.get("sessions", []), allow_empty=True)
        breaks = av.clean_breaks(body.get("breaks"), sessions)
        value = av.validate_exception(old, d, body.get("kind"), sessions, breaks)
    except av.ScheduleInvalid:
        fail(422, "SCHEDULE_INVALID")
    bad = av.newly_invalidated(db, user.id, old, av.with_exception(old, d, value), d, d)
    if bad:
        return conflict(db, bad)
    row = upsert(db, user.id, d, value, note); db.commit()
    return av.exception_dict(row)


@router.post("/schedule/exceptions/leave-range")
async def leave_range(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Mark every date from..to (inclusive) as leave. All-or-nothing: any affected appointment -> 409 and nothing is saved."""
    body = await json_body(request); note = note_of(body)
    start, end = day_or_422(body.get("from")), day_or_422(body.get("to"))
    if end < start or (end - start).days + 1 > av.MAX_LEAVE_RANGE_DAYS:
        fail(422, "SCHEDULE_INVALID")
    old = av.load(db, user.id); new = old
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    for d in days:
        new = av.with_exception(new, d, ("leave", [], []))
    bad = av.newly_invalidated(db, user.id, old, new, start, end)
    if bad:
        return conflict(db, bad)
    rows = [upsert(db, user.id, d, ("leave", [], []), note) for d in days]; db.commit()
    return {"items": [av.exception_dict(r) for r in rows]}


@router.delete("/schedule/exceptions/{day}")
def delete_exception(day: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = day_or_422(day, future=False)
    row = db.scalar(select(PortalScheduleException).where(PortalScheduleException.doctor_id == user.id, PortalScheduleException.day == d))
    if not row:
        fail(404, "NOT_FOUND")
    old = av.load(db, user.id)
    bad = av.newly_invalidated(db, user.id, old, av.with_exception(old, d, None), d, d)   # removing an extra/custom date may strand visits
    if bad:
        return conflict(db, bad)
    db.delete(row); db.commit()
    return {"date": d.isoformat(), "deleted": True}


@router.get("/schedule/day")
def schedule_day(date_: str = Query(..., alias="date"), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Calendar view of one date: effective sessions/breaks (source says why), the full slot grid and which slots are booked."""
    d = day_or_422(date_, future=False)
    avail = av.load(db, user.id); sessions, breaks, source = avail.day(d)
    lo = datetime(d.year, d.month, d.day, tzinfo=KARACHI).astimezone(timezone.utc)
    appts = [a for a in db.scalars(select(PortalAppointment).where(
        PortalAppointment.doctor_id == user.id, PortalAppointment.status.in_(("pending", "confirmed", "completed")),
        PortalAppointment.starts_at >= lo - timedelta(hours=3), PortalAppointment.starts_at < lo + timedelta(days=1))).all()
        if av.local_parts(a.starts_at)[0] == d]
    start_of = {av.hhmm(av.local_parts(a.starts_at)[1]): a.id for a in appts}
    return {"date": d.isoformat(), "source": source, "sessions": sessions, "breaks": breaks,
            "slots": [dict(g, booked_appointment_id=start_of.get(g["time"])) for g in avail.grid(d)],
            "appointments": [appointment_ar(db, a) for a in sorted(appts, key=lambda x: x.starts_at)]}


@router.get("/schedule/month")
def schedule_month(month: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$"), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Calendar overview of one month: per date the effective source (template|leave|custom_hours|extra_session),
    whether the doctor works that day and how many non-cancelled appointments exist. Read-only, additive."""
    y, m = int(month[:4]), int(month[5:])
    first = date(y, m, 1); nxt = date(y + (m == 12), m % 12 + 1, 1); last_day = (nxt - timedelta(days=1)).day
    avail = av.load(db, user.id)
    lo = datetime(first.year, first.month, 1, tzinfo=KARACHI).astimezone(timezone.utc)
    hi = datetime(nxt.year, nxt.month, 1, tzinfo=KARACHI).astimezone(timezone.utc)
    counts: dict = {}
    for a in db.scalars(select(PortalAppointment).where(
            PortalAppointment.doctor_id == user.id, PortalAppointment.status.in_(("pending", "confirmed", "completed")),
            PortalAppointment.starts_at >= lo, PortalAppointment.starts_at < hi)).all():
        d = av.local_parts(a.starts_at)[0]; counts[d] = counts.get(d, 0) + 1
    days = []
    for i in range(last_day):
        d = first + timedelta(days=i); sessions, _, source = avail.day(d)
        days.append({"date": d.isoformat(), "source": source, "is_working": bool(sessions), "sessions_count": len(sessions), "appointments_count": counts.get(d, 0)})
    return {"month": month, "days": days}


# ---------------------------------------------------------------- appointment protection
class CancelBody(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ProposeBody(BaseModel):
    date: str
    time: str = Field(min_length=5, max_length=5)
    note: str = Field("", max_length=300)


def own_appointment(db, user, appointment_id) -> PortalAppointment:
    a = db.scalar(select(PortalAppointment).where(PortalAppointment.id == appointment_id, PortalAppointment.doctor_id == user.id))
    if not a:
        fail(404, "NOT_FOUND")                  # other doctors' appointments are indistinguishable from missing ones
    return a


def own_proposal(db, user, proposal_id) -> PortalRescheduleProposal:
    p = db.scalar(select(PortalRescheduleProposal).where(PortalRescheduleProposal.id == proposal_id, PortalRescheduleProposal.doctor_id == user.id))
    if not p:
        fail(404, "NOT_FOUND")
    return p


@router.post("/appointments/{appointment_id}/cancel")
def cancel_appointment(appointment_id: int, body: CancelBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = ac.doctor_cancel(db, user, own_appointment(db, user, appointment_id), body.reason)
    return dict(appointment_ar(db, a), cancel_reason=a.cancel_reason)


@router.post("/appointments/{appointment_id}/reschedule-proposals", status_code=201)
def propose_reschedule(appointment_id: int, body: ProposeBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return ac.proposal_dict(db, ac.propose(db, user, own_appointment(db, user, appointment_id), body.date, body.time, body.note))


@router.get("/reschedule-proposals")
def list_proposals(status: str | None = None, appointment_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(PortalRescheduleProposal).where(PortalRescheduleProposal.doctor_id == user.id)
    if status:
        q = q.where(PortalRescheduleProposal.status == status)
    if appointment_id:
        q = q.where(PortalRescheduleProposal.appointment_id == appointment_id)
    return {"items": [ac.proposal_dict(db, p) for p in db.scalars(q.order_by(PortalRescheduleProposal.id.desc())).all()]}


@router.post("/reschedule-proposals/{proposal_id}/withdraw")
def withdraw_proposal(proposal_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return ac.proposal_dict(db, ac.withdraw(db, user, own_proposal(db, user, proposal_id)))
