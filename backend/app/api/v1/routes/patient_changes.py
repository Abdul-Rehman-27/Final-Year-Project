"""Patient side of doctor-initiated changes + in-app notifications (prefix /api/v1/patient, patient role only)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.v1.routes.patient import CodeErrorRoute, appt_dict, fail
from app.db.session import get_db
from app.models.portal import PortalNotification, PortalRescheduleProposal
from app.models.user import User
from app.services import appointment_changes as ac
from app.services.portal_core import iso, utcnow

router = APIRouter(prefix="/patient", tags=["patient portal"], dependencies=[Depends(require_roles("patient"))], route_class=CodeErrorRoute)


class DeclineBody(BaseModel):
    note: str = Field("", max_length=300)


def own_proposal(db, user, proposal_id) -> PortalRescheduleProposal:
    p = db.scalar(select(PortalRescheduleProposal).where(PortalRescheduleProposal.id == proposal_id, PortalRescheduleProposal.patient_id == user.id))
    if not p:
        fail(404, "NOT_FOUND")
    return p


def note_dict(n: PortalNotification) -> dict:
    return {"id": n.id, "kind": n.kind, "message": n.message, "data": n.data or {}, "created_at": iso(n.created_at), "read_at": iso(n.read_at)}


def unread(db, user) -> int:
    return len(db.scalars(select(PortalNotification.id).where(PortalNotification.user_id == user.id, PortalNotification.read_at.is_(None))).all())


@router.get("/reschedule-proposals")
def list_proposals(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(PortalRescheduleProposal).where(PortalRescheduleProposal.patient_id == user.id)
    if status:
        q = q.where(PortalRescheduleProposal.status == status)
    return {"items": [ac.proposal_dict(db, p) for p in db.scalars(q.order_by(PortalRescheduleProposal.id.desc())).all()]}


@router.post("/reschedule-proposals/{proposal_id}/accept")
def accept_proposal(proposal_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = own_proposal(db, user, proposal_id); a = ac.accept(db, user, p)
    return {"proposal": ac.proposal_dict(db, p), "appointment": appt_dict(db, a)}


@router.post("/reschedule-proposals/{proposal_id}/decline")
def decline_proposal(proposal_id: int, body: DeclineBody | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return ac.proposal_dict(db, ac.decline(db, user, own_proposal(db, user, proposal_id), body.note if body else ""))


@router.get("/notifications")
def notifications(unread_only: bool = False, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(PortalNotification).where(PortalNotification.user_id == user.id)
    if unread_only:
        q = q.where(PortalNotification.read_at.is_(None))
    return {"unread_count": unread(db, user), "items": [note_dict(n) for n in db.scalars(q.order_by(PortalNotification.id.desc()).limit(50)).all()]}


@router.post("/notifications/read-all")
def read_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    for n in db.scalars(select(PortalNotification).where(PortalNotification.user_id == user.id, PortalNotification.read_at.is_(None))).all():
        n.read_at = utcnow()
    db.commit()
    return {"unread_count": 0}


@router.post("/notifications/{notification_id}/read")
def read_one(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.scalar(select(PortalNotification).where(PortalNotification.id == notification_id, PortalNotification.user_id == user.id))
    if not n:
        fail(404, "NOT_FOUND")
    if not n.read_at:
        n.read_at = utcnow(); db.commit()
    return note_dict(n)
