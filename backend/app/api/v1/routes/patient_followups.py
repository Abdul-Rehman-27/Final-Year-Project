"""Patient side of follow-up recommendations (prefix /api/v1/patient, patient role only). See docs/FOLLOWUP_API.md."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.v1.routes.patient import CodeErrorRoute, appt_dict, fail
from app.db.session import get_db
from app.models.portal import PortalFollowupRecommendation
from app.models.user import User
from app.services import followups as fu

router = APIRouter(prefix="/patient", tags=["patient follow-ups"], dependencies=[Depends(require_roles("patient"))], route_class=CodeErrorRoute)


class AcceptBody(BaseModel):
    date: str | None = Field(None, min_length=10, max_length=10)   # both omitted = accept the recommended slot
    time: str | None = Field(None, min_length=5, max_length=5)      # both given = choose another slot with the same doctor


class DeclineBody(BaseModel):
    note: str = Field("", max_length=300)


def own_rec(db, user, rec_id) -> PortalFollowupRecommendation:
    r = db.scalar(select(PortalFollowupRecommendation).where(PortalFollowupRecommendation.id == rec_id, PortalFollowupRecommendation.patient_id == user.id))
    if not r:
        fail(404, "NOT_FOUND")
    return r


@router.get("/followup-recommendations")
def list_recommendations(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fu.expire_due(db)
    q = select(PortalFollowupRecommendation).where(PortalFollowupRecommendation.patient_id == user.id)
    if status:
        q = q.where(PortalFollowupRecommendation.status == status)
    return {"items": [fu.rec_dict(db, r) for r in db.scalars(q.order_by(PortalFollowupRecommendation.id.desc())).all()]}


@router.post("/followup-recommendations/{rec_id}/accept")
def accept(rec_id: int, body: AcceptBody | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = own_rec(db, user, rec_id)
    a = fu.accept(db, user, r, body.date if body else None, body.time if body else None)
    db.refresh(r)
    return {"recommendation": fu.rec_dict(db, r), "appointment": appt_dict(db, a)}


@router.post("/followup-recommendations/{rec_id}/decline")
def decline(rec_id: int, body: DeclineBody | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return fu.rec_dict(db, fu.decline(db, user, own_rec(db, user, rec_id), body.note if body else ""))
