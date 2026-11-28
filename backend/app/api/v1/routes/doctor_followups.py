"""Doctor follow-up endpoints + doctor in-app notifications (prefix /api/v1/doctor, doctor role only). See docs/FOLLOWUP_API.md."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.v1.routes.doctor import DoctorRoute, appointment_ar, fail, get_appt
from app.api.v1.routes.patient_changes import note_dict
from app.db.session import get_db
from app.models.portal import PortalAppointment, PortalFollowupRecommendation, PortalNotification
from app.models.user import User
from app.services import followups as fu
from app.services.portal_core import iso, utcnow

router = APIRouter(prefix="/doctor", tags=["doctor follow-ups"], dependencies=[Depends(require_roles("doctor"))], route_class=DoctorRoute)


class RecommendBody(BaseModel):
    date: str = Field(min_length=10, max_length=10)
    time: str = Field(min_length=5, max_length=5)
    note: str = Field("", max_length=300)


class DirectBody(BaseModel):
    date: str = Field(min_length=10, max_length=10)
    time: str = Field(min_length=5, max_length=5)
    patient_agreed: bool


def own_rec(db, user, rec_id) -> PortalFollowupRecommendation:
    r = db.scalar(select(PortalFollowupRecommendation).where(PortalFollowupRecommendation.id == rec_id, PortalFollowupRecommendation.doctor_id == user.id))
    if not r:
        fail(404, "NOT_FOUND")
    return r


@router.post("/appointments/{appointment_id}/followup-recommendations", status_code=201)
def recommend(appointment_id: int, body: RecommendBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return fu.rec_dict(db, fu.recommend(db, user, get_appt(db, user.id, appointment_id), body.date, body.time, body.note))


@router.post("/appointments/{appointment_id}/followups", status_code=201)
def schedule_directly(appointment_id: int, body: DirectBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = fu.schedule_directly(db, user, get_appt(db, user.id, appointment_id), body.date, body.time, body.patient_agreed)
    return {**appointment_ar(db, a), "booking_no": a.booking_no, "room_label": a.room_label, "source": a.source,
            "created_by_doctor_id": a.created_by_doctor_id, "patient_agreed": a.patient_agreed, "agreed_at": iso(a.agreed_at), "created_at": iso(a.created_at)}


@router.get("/followup-recommendations")
def list_recommendations(status: str | None = None, appointment_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fu.expire_due(db)
    q = select(PortalFollowupRecommendation).where(PortalFollowupRecommendation.doctor_id == user.id)
    if status:
        q = q.where(PortalFollowupRecommendation.status == status)
    if appointment_id:
        q = q.where(PortalFollowupRecommendation.source_appointment_id == appointment_id)
    return {"items": [fu.rec_dict(db, r) for r in db.scalars(q.order_by(PortalFollowupRecommendation.id.desc())).all()]}


@router.post("/followup-recommendations/{rec_id}/withdraw")
def withdraw(rec_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return fu.rec_dict(db, fu.withdraw(db, user, own_rec(db, user, rec_id)))


# ---------- doctor in-app notifications (same table / shape as the patient bell) ----------
def _unread(db, user) -> int:
    return len(db.scalars(select(PortalNotification.id).where(PortalNotification.user_id == user.id, PortalNotification.read_at.is_(None))).all())


@router.get("/notifications")
def notifications(unread_only: bool = False, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(PortalNotification).where(PortalNotification.user_id == user.id)
    if unread_only:
        q = q.where(PortalNotification.read_at.is_(None))
    return {"unread_count": _unread(db, user), "items": [note_dict(n) for n in db.scalars(q.order_by(PortalNotification.id.desc()).limit(50)).all()]}


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
