"""Patient portal API (/api/v1/patient). Every query is scoped to the authenticated patient.

Response shapes mirror what the patient screens render (frontend/src/pages/patient/**). snake_case JSON, ISO-8601 UTC
datetimes, errors as {"detail": "CODE"} (NOT_FOUND 404, VALIDATION_ERROR 422, SLOT_IN_PAST 422, SLOT_UNAVAILABLE 409,
APPOINTMENT_LOCKED 409).
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.routing import APIRoute
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.portal import (PortalAppointment, PortalHospitalSettings, PortalLabReport, PortalLabReportFile,
                               PortalLabTest, PortalPrescription, PortalPrescriptionItem)
from app.models.user import User
from app.services import patient_portal as svc
from app.services.portal_core import age_on, as_utc, iso, local_day, utcnow

fail = svc.fail


class CodeErrorRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def wrapped(request: Request):
            try:
                return await handler(request)
            except RequestValidationError:
                return JSONResponse(status_code=422, content={"detail": "VALIDATION_ERROR"})
        return wrapped


router = APIRouter(prefix="/patient", tags=["patient portal"], dependencies=[Depends(require_roles("patient"))], route_class=CodeErrorRoute)


# ---------- request bodies ----------
class BookBody(BaseModel):
    doctor_id: int
    date: str = Field(min_length=10, max_length=10)   # YYYY-MM-DD, hospital local date
    time: str = Field(min_length=5, max_length=5)     # HH:MM, one of the slots returned by /doctors/{id}/slots
    is_followup: bool = False                         # P5d: patient-initiated follow-up (flagged)
    followup_of_appointment_id: int | None = None     # P5d: optional link to the patient's own earlier visit (implies is_followup)


class RescheduleBody(BaseModel):
    doctor_id: int | None = None                      # optional: keep the same doctor
    date: str = Field(min_length=10, max_length=10)
    time: str = Field(min_length=5, max_length=5)


class LabBookBody(BaseModel):
    test_id: int
    date: str = Field(min_length=10, max_length=10)
    time: str = Field(min_length=5, max_length=5)
    notes: str = Field(default="", max_length=500)


# ---------- serializers ----------
def person(u: User):
    return {"id": u.id, "full_name": u.full_name, "age": age_on(u.date_of_birth), "gender": u.gender}


def hospital_dict(db: Session):
    h = db.get(PortalHospitalSettings, 1) or PortalHospitalSettings()
    return {"name": h.name, "address": h.address, "phone": h.phone, "email": h.email, "open_hours": h.open_hours, "emergency_number": h.emergency_number or ""}


def appt_dict(db: Session, a: PortalAppointment):
    doc = db.get(User, a.doctor_id); dep = svc.department_of(db, a.doctor_id)
    upcoming = a.status in svc.ACTIVE and a.visit_status == "scheduled" or (a.status in svc.ACTIVE and a.visit_status == "in_progress")
    upcoming = upcoming and local_day(a.starts_at) >= local_day(utcnow())
    return {"id": a.id, "group": "upcoming" if upcoming else "past", "booking_no": a.booking_no, "starts_at": iso(a.starts_at),
            "doctor_id": a.doctor_id, "doctor_name": doc.full_name, "department": dep.name if dep else None, "status": a.status,
            "visit_status": a.visit_status, "token_no": a.token_no, "room_label": a.room_label,
            "can_edit": svc.editable(a), "can_cancel": svc.editable(a),
            "is_followup": bool(a.is_followup), "followup_of_appointment_id": a.followup_of_appointment_id}


def rx_dict(db: Session, rx: PortalPrescription):
    doc = db.get(User, rx.doctor_id); dep = svc.department_of(db, rx.doctor_id); pat = db.get(User, rx.patient_id)
    items = db.scalars(select(PortalPrescriptionItem).where(PortalPrescriptionItem.prescription_id == rx.id).order_by(PortalPrescriptionItem.position)).all()
    status = "completed" if rx.status == "active" and local_day(utcnow()) > rx.issued_on + timedelta(days=rx.duration_days) else rx.status
    return {"id": rx.id, "rx_no": rx.rx_no, "status": status, "issued_on": rx.issued_on.isoformat(), "duration_days": rx.duration_days,
            "doctor_name": doc.full_name, "department": dep.name if dep else None, "patient": person(pat), "instructions": rx.instructions,
            "items": [{"medicine": i.medicine, "dosage": i.dosage, "timing": i.timing} for i in items]}


def lab_row(db: Session, r: PortalLabReport):
    return {"id": r.id, "report_no": r.report_no, "test_name": r.test_name, "kind": r.kind, "status": r.status,
            "created_at": iso(r.created_at), "scheduled_for": iso(r.scheduled_for), "performed_at": iso(r.performed_at)}


def lab_detail(db: Session, r: PortalLabReport):
    d = lab_row(db, r); ready = r.status == "ready"
    doc = db.get(User, r.requested_by_doctor_id) if r.requested_by_doctor_id else None
    files = db.scalars(select(PortalLabReportFile).where(PortalLabReportFile.report_id == r.id).order_by(PortalLabReportFile.id)).all() if ready else []
    d.update({"patient": person(db.get(User, r.patient_id)), "referred_by": doc.full_name if doc else None, "notes": r.notes,
              "technique": r.technique if ready else "", "findings": r.findings if ready else "", "impression": r.impression if ready else "",
              "comments": r.comments if ready else "", "reported_by_name": r.reported_by_name if ready else None,
              "results": (r.results or []) if ready else [],
              "files": [{"id": f.id, "kind": "pdf" if f.content_type == "application/pdf" else "image", "caption": f.name} for f in files]})
    return d


def own_appt(db, user, appointment_id) -> PortalAppointment:
    a = db.scalar(select(PortalAppointment).where(PortalAppointment.id == appointment_id, PortalAppointment.patient_id == user.id))
    if not a:
        fail(404, "NOT_FOUND")
    return a


def own_lab(db, user, report_id) -> PortalLabReport:
    r = db.scalar(select(PortalLabReport).where(PortalLabReport.id == report_id, PortalLabReport.patient_id == user.id, PortalLabReport.status != "cancelled"))
    if not r:
        fail(404, "NOT_FOUND")
    return r


# ---------- profile / hospital / dashboard ----------
@router.get("/profile")
def profile(user: User = Depends(get_current_user)):
    return person(user) | {"email": user.email}


@router.get("/hospital")
def hospital(db: Session = Depends(get_db)):
    return hospital_dict(db)


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    appts = db.scalars(select(PortalAppointment).where(PortalAppointment.patient_id == user.id).order_by(PortalAppointment.starts_at.desc())).all()
    rows = [appt_dict(db, a) for a in appts]
    upcoming = sorted([a for a in appts if a.status == "confirmed" and appt_dict(db, a)["group"] == "upcoming"], key=lambda a: as_utc(a.starts_at))
    pending = sorted([a for a in appts if a.status == "pending" and as_utc(a.starts_at) > utcnow()], key=lambda a: as_utc(a.starts_at))
    labs = [r for r in db.scalars(select(PortalLabReport).where(PortalLabReport.patient_id == user.id, PortalLabReport.status != "cancelled").order_by(PortalLabReport.created_at.desc())).all()]
    rxs = [rx_dict(db, x) for x in db.scalars(select(PortalPrescription).where(PortalPrescription.patient_id == user.id).order_by(PortalPrescription.id.desc())).all()]
    active = [x for x in rxs if x["status"] == "active"]
    ready = [r for r in labs if r.status == "ready"]
    return {"server_now": iso(utcnow()), "patient": person(user), "hospital": hospital_dict(db),
            "next_appointment": appt_dict(db, upcoming[0]) if upcoming else None,
            "stats": {"active_prescriptions": len(active), "active_medicines": [i["medicine"] for x in active for i in x["items"]][:3],
                      "ready_results": len(ready), "ready_result_names": [r.test_name for r in ready][:2],
                      "awaiting_confirmation": len(pending), "next_awaiting": appt_dict(db, pending[0]) if pending else None},
            "recent_appointments": rows[:3], "lab_results": [lab_row(db, r) for r in labs[:5]]}


# ---------- booking lookups ----------
@router.get("/departments")
def departments(db: Session = Depends(get_db)):
    seen = {}
    for d in svc.bookable_doctors(db):
        seen[d["department_id"]] = d["department"]
    return [{"id": i, "name": n} for i, n in sorted(seen.items(), key=lambda kv: kv[1])]


@router.get("/doctors")
def doctors(department_id: int | None = None, db: Session = Depends(get_db)):
    return svc.bookable_doctors(db, department_id)


@router.get("/doctors/{doctor_id}/slots")
def slots(doctor_id: int, date: str, exclude_appointment_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not any(d["id"] == doctor_id for d in svc.bookable_doctors(db)):
        fail(404, "NOT_FOUND")
    day = svc.parse_day(date)
    if exclude_appointment_id is not None:   # only the caller's own appointment may be ignored (reschedule screen)
        mine = db.get(PortalAppointment, exclude_appointment_id)
        if not mine or mine.patient_id != user.id:
            exclude_appointment_id = None
    det = svc.day_slot_details(db, doctor_id, day, ignore_appointment_id=exclude_appointment_id, patient_id=user.id)
    # `room_label` (first free slot's room) + `slots` kept for compatibility; `slots_detail` adds per-slot room and length.
    return {"doctor_id": doctor_id, "date": day.isoformat(), "room_label": det[0]["room_label"] if det else "",
            "slots": [d["time"] for d in det], "slots_detail": det}


# ---------- appointments ----------
@router.get("/appointments")
def list_appointments(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = [appt_dict(db, a) for a in db.scalars(select(PortalAppointment).where(PortalAppointment.patient_id == user.id)).all()]
    up = sorted([x for x in items if x["group"] == "upcoming"], key=lambda x: x["starts_at"])
    past = sorted([x for x in items if x["group"] == "past"], key=lambda x: x["starts_at"], reverse=True)
    return {"items": up + past}


@router.post("/appointments", status_code=201)
def book_appointment(body: BookBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.is_followup or body.followup_of_appointment_id is not None:
        from app.services import followups as fu
        return appt_dict(db, fu.self_book(db, user, body.doctor_id, body.date, body.time, body.followup_of_appointment_id))
    return appt_dict(db, svc.book(db, user, body.doctor_id, body.date, body.time))


@router.patch("/appointments/{appointment_id}")
def reschedule_appointment(appointment_id: int, body: RescheduleBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return appt_dict(db, svc.reschedule(db, own_appt(db, user, appointment_id), body.doctor_id, body.date, body.time))


@router.post("/appointments/{appointment_id}/cancel")
def cancel_appointment(appointment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return appt_dict(db, svc.cancel(db, own_appt(db, user, appointment_id)))


@router.get("/appointments/{appointment_id}/token")
def token_slip(appointment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = own_appt(db, user, appointment_id)
    if a.status not in ("confirmed", "completed") or not a.token_no:
        fail(404, "NOT_FOUND")
    return appt_dict(db, a) | {"patient": person(user), "hospital": hospital_dict(db)}


# ---------- prescriptions ----------
@router.get("/prescriptions")
def list_prescriptions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(PortalPrescription).where(PortalPrescription.patient_id == user.id).order_by(PortalPrescription.issued_on.desc(), PortalPrescription.id.desc())).all()
    return {"items": [rx_dict(db, x) for x in rows]}


@router.get("/prescriptions/{rx_id}")
def get_prescription(rx_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rx = db.scalar(select(PortalPrescription).where(PortalPrescription.id == rx_id, PortalPrescription.patient_id == user.id))
    if not rx:
        fail(404, "NOT_FOUND")
    return rx_dict(db, rx) | {"hospital": hospital_dict(db)}


# ---------- lab reports ----------
@router.get("/lab-tests")
def lab_tests(db: Session = Depends(get_db)):
    return [{"id": t.id, "name": t.name, "kind": t.kind, "prep_note": t.prep_note} for t in db.scalars(select(PortalLabTest).order_by(PortalLabTest.name)).all()]


@router.get("/lab-reports")
def list_lab_reports(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(PortalLabReport).where(PortalLabReport.patient_id == user.id, PortalLabReport.status != "cancelled").order_by(PortalLabReport.created_at.desc(), PortalLabReport.id.desc())).all()
    return {"items": [lab_row(db, r) for r in rows]}


@router.post("/lab-reports", status_code=201)
def book_lab_test(body: LabBookBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    test = db.get(PortalLabTest, body.test_id)
    if not test:
        fail(404, "NOT_FOUND")
    when = svc.validate_lab_booking(db, user, test.id, body.date, body.time)
    r = PortalLabReport(test_id=test.id, test_name=test.name, kind=test.kind, patient_id=user.id, requested_by_doctor_id=None,
                        status="scheduled", scheduled_for=when, notes=body.notes.strip())
    db.add(r); db.flush(); r.report_no = ("LAB-" if test.kind == "lab" else "RAD-") + str(1000 + r.id); db.commit()
    return lab_detail(db, r)


@router.get("/lab-reports/{report_id}")
def get_lab_report(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return lab_detail(db, own_lab(db, user, report_id)) | {"hospital": hospital_dict(db)}


@router.get("/lab-reports/{report_id}/files/{file_id}")
def get_lab_file(report_id: int, file_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = own_lab(db, user, report_id); f = db.get(PortalLabReportFile, file_id)
    if r.status != "ready" or not f or f.report_id != r.id:
        fail(404, "NOT_FOUND")
    return Response(content=f.data, media_type=f.content_type, headers={"Cache-Control": "private, no-store"})
