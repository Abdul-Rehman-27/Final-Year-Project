import re
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.routing import APIRoute
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.admin import AdminDepartment, AdminStaffProfile
from app.models.portal import (PortalAppointment, PortalDoctorSchedule, PortalHospitalSettings, PortalPrescription, PortalPrescriptionItem, PortalLabTest, PortalLabReport, PortalLabReportFile, PortalClinicalSummary)
from app.models.user import User
from app.services import availability as av
from app.services.portal_core import as_utc, utcnow, local_day, iso, age_on, build_queue, assign_token
from app.services.medical_assistant_client import summarize_text, MedicalAssistantError

class DoctorRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        async def wrapped(request: Request):
            try: return await handler(request)
            except RequestValidationError:
                return JSONResponse(status_code=422, content={"detail": "SCHEDULE_INVALID" if "/schedule" in request.url.path and request.method in ("PUT", "POST") else "VALIDATION_ERROR"})
        return wrapped

router = APIRouter(prefix="/doctor", tags=["doctor portal"], dependencies=[Depends(require_roles("doctor"))], route_class=DoctorRoute)

def fail(status, code): raise HTTPException(status_code=status, detail=code)

def schedule_rows(db, doctor_id): return av.template_rows(db, doctor_id)

def patient(db, patient_id): return db.get(User, patient_id)
def dept_name(db, doctor_id):
    staff = db.get(AdminStaffProfile, doctor_id)
    dep = db.get(AdminDepartment, staff.department_id) if staff and staff.department_id else None
    return dep.name if dep else None
def followup_history(db, patient_id):
    from app.services import followups as fu  # local import: followups imports this module's helpers
    return fu.history(db, patient_id)
def related(db, doctor_id, patient_id): return db.scalar(select(PortalAppointment.id).where(PortalAppointment.doctor_id==doctor_id, PortalAppointment.patient_id==patient_id, PortalAppointment.status.in_(("confirmed","completed"))).limit(1)) is not None
def effective_rx(rx):
    from datetime import timedelta
    return "completed" if rx.status == "active" and local_day(utcnow()) > rx.issued_on + timedelta(days=rx.duration_days) else rx.status
def rx_brief(db, rx):
    p=patient(db,rx.patient_id); items=db.scalars(select(PortalPrescriptionItem).where(PortalPrescriptionItem.prescription_id==rx.id).order_by(PortalPrescriptionItem.position)).all()
    return {"id":rx.id,"rx_no":rx.rx_no,"patient_id":rx.patient_id,"patient_name":p.full_name,"issued_on":rx.issued_on.isoformat(),"duration_days":rx.duration_days,"status":effective_rx(rx),"items":[{"medicine":x.medicine,"dosage":x.dosage,"timing":x.timing} for x in items],"instructions":rx.instructions}
def appointment_ar(db,a,entry=None):
    p=patient(db,a.patient_id); state=entry["state"] if entry else "none"
    return {"id":a.id,"starts_at":iso(a.starts_at),"patient_id":a.patient_id,"patient_name":p.full_name,"patient_age":age_on(p.date_of_birth),"reason":a.reason,"status":a.status,"visit_status":a.visit_status,"queue_state":state,"token_no":a.token_no,"is_followup":bool(a.is_followup),"followup_of_appointment_id":a.followup_of_appointment_id}
def today_entries(db, doctor_id):
    now=utcnow(); rows=[a for a in db.scalars(select(PortalAppointment).where(PortalAppointment.doctor_id==doctor_id,PortalAppointment.status.in_(("confirmed","completed")))).all() if local_day(a.starts_at)==local_day(now)]
    grace=(db.get(PortalHospitalSettings,1) or PortalHospitalSettings()).grace_minutes
    return rows, build_queue(rows,now,grace), now, grace
def queue_item(db,e):
    a=e["appointment"]; d=appointment_ar(db,a,e)
    d.update({"position":e["position"],"checked_in_at":iso(a.checked_in_at),"called_at":iso(a.called_at),"completed_at":iso(a.completed_at),"grace_ends_at":iso(e["grace"]) if e["state"]=="holding" else None,"can_call":e["can_call"],"call_blocked_reason":e["call_blocked_reason"],"blocked_by_name":e["blocked_by_name"]})
    return d
def get_appt(db, doctor_id, appointment_id, lock=False):
    q=select(PortalAppointment).where(PortalAppointment.id==appointment_id,PortalAppointment.doctor_id==doctor_id)
    if lock:q=q.with_for_update()
    a=db.scalar(q)
    if not a:fail(404,"NOT_FOUND")
    return a
def appointment_detail(db,a):
    _,q,_,_=today_entries(db,a.doctor_id); entry=next((x for x in q["entries"] if x["appointment"].id==a.id),None); p=patient(db,a.patient_id)
    rxs=[rx_brief(db,x) for x in db.scalars(select(PortalPrescription).where(PortalPrescription.appointment_id==a.id)).all()]
    labs=[lab_brief(db,x) for x in db.scalars(select(PortalLabReport).where(PortalLabReport.appointment_id==a.id)).all()]
    return {"id":a.id,"booking_no":a.booking_no,"token_no":a.token_no,"starts_at":iso(a.starts_at),"checked_in_at":iso(a.checked_in_at),"called_at":iso(a.called_at),"completed_at":iso(a.completed_at),"status":a.status,"visit_status":a.visit_status,"queue_state":entry["state"] if entry else "none","reason":a.reason,"source":a.source,"room_label":a.room_label,"can_call":entry["can_call"] if entry else False,"patient":{"id":p.id,"full_name":p.full_name,"age":age_on(p.date_of_birth),"gender":p.gender},"prescriptions":rxs,"lab_reports":labs}
def lab_brief(db,r):
    p=patient(db,r.patient_id)
    return {"id":r.id,"report_no":r.report_no,"test_name":r.test_name,"kind":r.kind,"patient_id":r.patient_id,"patient_name":p.full_name,"status":r.status,"created_at":iso(r.created_at),"scheduled_for":iso(r.scheduled_for)}

@router.get("/profile")
def profile(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    staff = db.get(AdminStaffProfile, user.id)
    department = db.get(AdminDepartment, staff.department_id).name if staff and staff.department_id and db.get(AdminDepartment, staff.department_id) else None
    return {"id": user.id, "full_name": user.full_name, "department": department, "specialty": staff.specialty if staff else ""}

@router.get("/hospital-info")
def hospital_info(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(PortalHospitalSettings, 1)
    if not row: fail(503, "DASHBOARD_UNAVAILABLE")
    return {k: getattr(row, k) for k in ("name", "address", "phone", "email", "open_hours", "timezone", "grace_minutes")}

@router.get("/schedule")
def get_schedule(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"days": schedule_rows(db, user.id)}

@router.put("/schedule")
async def put_schedule(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Replace the weekly template. Each day may carry `sessions` (+ `breaks`); a legacy item without `sessions` that matches the
    stored first session keeps the day as it is, a changed legacy item replaces the day with that single session.
    A change that would leave a future appointment outside the new hours is refused: 409 SCHEDULE_CONFLICT + the appointments."""
    try: body = await request.json(); days = body["days"]
    except Exception: fail(422, "SCHEDULE_INVALID")
    if not isinstance(days, list) or len(days) != 7: fail(422, "SCHEDULE_INVALID")
    old = av.load(db, user.id); seen = set(); templates = {}
    for item in days:
        if not isinstance(item, dict) or type(item.get("weekday")) is not int or item["weekday"] not in range(7) or item["weekday"] in seen or type(item.get("is_active")) is not bool:
            fail(422, "SCHEDULE_INVALID")
        wd = item["weekday"]; seen.add(wd)
        if not item["is_active"]: templates[wd] = ([], []); continue
        try:
            if "sessions" in item:
                sessions = av.clean_sessions(item["sessions"]); breaks = av.clean_breaks(item.get("breaks"), sessions)
            else:
                if not isinstance(item.get("room_label"), str): fail(422, "SCHEDULE_INVALID")
                legacy = av.clean_sessions([{k: item.get(k) for k in ("start_time", "end_time", "slot_minutes", "room_label")}])
                stored_s, stored_b = old.templates.get(wd, ([], []))
                sessions, breaks = (stored_s, stored_b) if stored_s and stored_s[0] == legacy[0] else (legacy, [])
        except av.ScheduleInvalid: fail(422, "SCHEDULE_INVALID")
        templates[wd] = (sessions, breaks)
    bad = av.newly_invalidated(db, user.id, old, av.with_templates(old, templates))
    if bad: return JSONResponse(status_code=409, content={"detail": "SCHEDULE_CONFLICT", "appointments": [appointment_ar(db, a) for a in bad]})
    for wd, (sessions, breaks) in templates.items():
        row = db.get(PortalDoctorSchedule, {"doctor_id": user.id, "weekday": wd})
        if not row: row = PortalDoctorSchedule(doctor_id=user.id, weekday=wd); db.add(row)
        first = sessions[0] if sessions else None
        row.is_active = bool(sessions); row.sessions_json = sessions; row.breaks_json = breaks
        row.start_time, row.end_time = (first["start_time"], first["end_time"]) if first else (None, None)
        row.slot_minutes, row.room_label = (first["slot_minutes"], first["room_label"]) if first else (15, "")
    db.commit()
    return {"days": schedule_rows(db, user.id)}

@router.get("/queue")
def queue(db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    _,q,now,grace=today_entries(db,user.id)
    return {"server_now":iso(now),"grace_minutes":grace,"counts":q["counts"],"items":[queue_item(db,x) for x in q["items"]],"expected":[{"id":x["appointment"].id,"patient_name":patient(db,x["appointment"].patient_id).full_name,"starts_at":iso(x["start"]),"grace_ends_at":iso(x["grace"]) if x["state"]=="holding" else None,"expected_state":x["state"]} for x in q["expected"]]}

@router.get("/dashboard")
def dashboard(db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    try:
        rows,q,now,_=today_entries(db,user.id); today=local_day(now)
        all_appts=db.scalars(select(PortalAppointment).where(PortalAppointment.doctor_id==user.id)).all()
        entries={x["appointment"].id:x for x in q["entries"]}; waiting=[x for x in q["entries"] if x["state"]=="waiting"]
        upcoming=[a for a in all_appts if a.status in ("pending","confirmed") and local_day(a.starts_at)>today][:10]
        recent_labs=db.scalars(select(PortalLabReport).where(PortalLabReport.requested_by_doctor_id==user.id).order_by(PortalLabReport.created_at.desc()).limit(3)).all()
        recent_rx=db.scalars(select(PortalPrescription).where(PortalPrescription.doctor_id==user.id).order_by(PortalPrescription.created_at.desc()).limit(3)).all()
        patients={a.patient_id for a in all_appts if a.status in ("confirmed","completed")}
        breakdown={"in_progress":q["counts"]["in_progress"],"waiting":q["counts"]["waiting"],"later":sum(x["state"] not in ("completed","incomplete","in_progress","waiting") for x in q["entries"])}
        return {"server_now":iso(now),"stats":{"total_patients":len(patients),"appointments_today":len(rows),"in_queue_now":breakdown["in_progress"]+breakdown["waiting"],"today_breakdown":breakdown,"next_waiting":{"token_no":waiting[0]["appointment"].token_no,"patient_name":patient(db,waiting[0]["appointment"].patient_id).full_name} if waiting else None},"today":[appointment_ar(db,a,entries[a.id]) for a in sorted(rows,key=lambda x:as_utc(x.starts_at)) if a.status!="cancelled"],"upcoming":[appointment_ar(db,a) for a in sorted(upcoming,key=lambda x:as_utc(x.starts_at))],"schedule":schedule_rows(db,user.id),"recent_tests":[lab_brief(db,x) for x in recent_labs],"recent_prescriptions":[rx_brief(db,x) for x in recent_rx]}
    except HTTPException: raise
    except Exception: fail(503,"DASHBOARD_UNAVAILABLE")

@router.get("/appointments/{appointment_id}")
def appointment_get(appointment_id:int,db:Session=Depends(get_db),user:User=Depends(get_current_user)): return appointment_detail(db,get_appt(db,user.id,appointment_id))

@router.post("/appointments/{appointment_id}/check-in")
def checkin(appointment_id:int,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    a=get_appt(db,user.id,appointment_id,True)
    if local_day(a.starts_at)!=local_day(utcnow()):fail(409,"NOT_TODAY")
    if a.checked_in_at:fail(409,"ALREADY_CHECKED_IN")
    if a.status!="confirmed" or a.visit_status!="scheduled":fail(409,"INVALID_TRANSITION")
    a.checked_in_at=utcnow();db.commit();_,q,_,_=today_entries(db,user.id);return queue_item(db,next(x for x in q["entries"] if x["appointment"].id==a.id))

@router.patch("/appointments/{appointment_id}/visit-status")
async def visit_status(appointment_id:int,request:Request,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    a=get_appt(db,user.id,appointment_id,True)
    try: target=(await request.json())["visit_status"]
    except Exception: fail(422,"VALIDATION_ERROR")
    if local_day(a.starts_at)!=local_day(utcnow()):fail(409,"NOT_TODAY")
    if not a.checked_in_at:fail(409,"NOT_CHECKED_IN")
    if target not in ("in_progress","completed","incomplete"):fail(409,"INVALID_TRANSITION")
    if a.visit_status=="scheduled":
        _,q,_,_=today_entries(db,user.id); e=next(x for x in q["entries"] if x["appointment"].id==a.id)
        if target not in ("in_progress","incomplete"):fail(409,"INVALID_TRANSITION")
        if target=="in_progress" and not e["can_call"]:fail(409,{"in_progress":"ALREADY_IN_PROGRESS","held":"QUEUE_HELD"}.get(e["call_blocked_reason"],"NOT_NEXT"))
    elif a.visit_status=="in_progress":
        if target not in ("completed","incomplete"):fail(409,"INVALID_TRANSITION")
    else: fail(409,"INVALID_TRANSITION")
    a.visit_status=target
    if target=="in_progress":a.called_at=utcnow()
    else:
        a.completed_at=utcnow()
        if target=="completed":a.status="completed"
    try:db.commit()
    except Exception:db.rollback();fail(409,"ALREADY_IN_PROGRESS")
    return appointment_detail(db,a)

def rx_detail(db,rx):
    data=rx_brief(db,rx); p=patient(db,rx.patient_id); a=db.get(PortalAppointment,rx.appointment_id) if rx.appointment_id else None; staff=db.get(AdminStaffProfile,rx.doctor_id); dep=db.get(AdminDepartment,staff.department_id).name if staff and staff.department_id and db.get(AdminDepartment,staff.department_id) else None
    data.update({"appointment_id":rx.appointment_id,"doctor":{"name":patient(db,rx.doctor_id).full_name,"department":dep},"patient":{"name":p.full_name,"age":age_on(p.date_of_birth),"gender":p.gender},"appointment":({"id":a.id,"booking_no":a.booking_no,"starts_at":iso(a.starts_at),"token_no":a.token_no,"room_label":a.room_label} if a else None)})
    return data
@router.post("/appointments/{appointment_id}/prescriptions",status_code=201)
async def create_rx(appointment_id:int,request:Request,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    a=get_appt(db,user.id,appointment_id)
    if a.visit_status!="in_progress":fail(409,"VISIT_NOT_IN_PROGRESS")
    try:b=await request.json();items=b["items"]; duration=b["duration_days"]; instructions=b.get("instructions","")
    except Exception:fail(422,"VALIDATION_ERROR")
    if not isinstance(items,list) or not 1<=len(items)<=10 or type(duration) is not int or not 1<=duration<=365 or not isinstance(instructions,str) or len(instructions)>1000:fail(422,"VALIDATION_ERROR")
    clean=[]
    for x in items:
        if not isinstance(x,dict):fail(422,"VALIDATION_ERROR")
        vals=[]
        for key,maxlen in (("medicine",100),("dosage",60),("timing",80)):
            v=x.get(key)
            if not isinstance(v,str) or not v.strip() or len(v.strip())>maxlen:fail(422,"VALIDATION_ERROR")
            vals.append(v.strip())
        clean.append(vals)
    rx=PortalPrescription(appointment_id=a.id,patient_id=a.patient_id,doctor_id=user.id,issued_on=local_day(utcnow()),duration_days=duration,status="active",instructions=instructions);db.add(rx);db.flush();rx.rx_no=f"Rx-{1000+rx.id}"
    for i,(m,d,t) in enumerate(clean):db.add(PortalPrescriptionItem(prescription_id=rx.id,position=i,medicine=m,dosage=d,timing=t))
    db.commit();return rx_detail(db,rx)
@router.get("/prescriptions")
def list_rx(q:str="",from_:str|None=Query(None,alias="from"),to:str|None=None,limit:int=25,offset:int=0,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    rows=db.scalars(select(PortalPrescription).where(PortalPrescription.doctor_id==user.id).order_by(PortalPrescription.issued_on.desc(),PortalPrescription.id.desc())).all()
    try:
        if from_:rows=[x for x in rows if x.issued_on>=date.fromisoformat(from_)]
        if to:rows=[x for x in rows if x.issued_on<=date.fromisoformat(to)]
    except ValueError:fail(422,"VALIDATION_ERROR")
    if q:rows=[x for x in rows if q.lower() in patient(db,x.patient_id).full_name.lower()]
    return {"items":[rx_brief(db,x) for x in rows[offset:offset+min(max(limit,1),100)]],"total":len(rows)}
@router.get("/prescriptions/{rx_id}")
def get_rx(rx_id:int,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    rx=db.scalar(select(PortalPrescription).where(PortalPrescription.id==rx_id,PortalPrescription.doctor_id==user.id))
    if not rx:fail(404,"NOT_FOUND")
    return rx_detail(db,rx)

@router.get("/patients/options")
def patient_options(db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    ids={a.patient_id for a in db.scalars(select(PortalAppointment).where(PortalAppointment.doctor_id==user.id,PortalAppointment.status.in_(("confirmed","completed")))).all()};return [{"id":p.id,"full_name":p.full_name,"age":age_on(p.date_of_birth)} for p in sorted((patient(db,i) for i in ids),key=lambda x:x.full_name)]
@router.get("/patients")
def patients(q:str="",limit:int=25,offset:int=0,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    opts=patient_options(db,user)
    if q:opts=[x for x in opts if q.lower() in x["full_name"].lower()]
    for x in opts:
        ap=[a for a in db.scalars(select(PortalAppointment).where(PortalAppointment.doctor_id==user.id,PortalAppointment.patient_id==x["id"])).all()];x.update({"last_visit":iso(max((a.starts_at for a in ap if a.status=="completed"),default=None)),"active_rx_count":sum(effective_rx(r)=="active" for r in db.scalars(select(PortalPrescription).where(PortalPrescription.doctor_id==user.id,PortalPrescription.patient_id==x["id"])).all()),"next_appointment":iso(min((a.starts_at for a in ap if a.status in ("pending","confirmed") and as_utc(a.starts_at)>utcnow()),default=None))})
    return {"items":opts[offset:offset+min(max(limit,1),100)],"total":len(opts)}
@router.get("/patients/{patient_id}")
def patient_detail(patient_id:int,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    if not related(db,user.id,patient_id):fail(404,"NOT_FOUND")
    p=patient(db,patient_id)
    rxs=[rx_brief(db,x)|{"doctor_name":patient(db,x.doctor_id).full_name} for x in db.scalars(select(PortalPrescription).where(PortalPrescription.patient_id==patient_id).order_by(PortalPrescription.id.desc())).all()]
    ap=[{"id":a.id,"starts_at":iso(a.starts_at),"doctor_name":patient(db,a.doctor_id).full_name,"department":dept_name(db,a.doctor_id),"status":a.status,"visit_status":a.visit_status,"token_no":a.token_no,"booking_no":a.booking_no}
        for a in db.scalars(select(PortalAppointment).where(PortalAppointment.patient_id==patient_id).order_by(PortalAppointment.starts_at.desc()).limit(50)).all()]
    return {"id":p.id,"full_name":p.full_name,"age":age_on(p.date_of_birth),"gender":p.gender,"email":p.email,"prescriptions":rxs,"appointments":ap,"followups":followup_history(db,patient_id)}
@router.get("/patients/{patient_id}/summary-base")
def summary_base(patient_id:int,appointment_id:int|None=None,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    if not related(db,user.id,patient_id):fail(404,"NOT_FOUND")
    if appointment_id is not None and not db.scalar(select(PortalAppointment.id).where(PortalAppointment.id==appointment_id,PortalAppointment.doctor_id==user.id,PortalAppointment.patient_id==patient_id)):fail(404,"NOT_FOUND")
    ap=db.scalars(select(PortalAppointment).where(PortalAppointment.patient_id==patient_id,PortalAppointment.status.in_(("confirmed","completed"))).order_by(PortalAppointment.starts_at.desc())).all()
    completed=next((a for a in ap if a.status=="completed"),None);p=patient(db,patient_id)
    return {"snapshot":{"name":p.full_name,"age":age_on(p.date_of_birth),"gender":p.gender,"last_visit":{"starts_at":iso(completed.starts_at),"department":dept_name(db,completed.doctor_id)} if completed else None},
            "past_appointments":[{"doctor_name":patient(db,a.doctor_id).full_name,"department":dept_name(db,a.doctor_id),"starts_at":iso(a.starts_at),"status":a.status} for a in ap if a.id!=appointment_id][:3]}
@router.get("/lab-tests")
def lab_tests(db:Session=Depends(get_db),user:User=Depends(get_current_user)):return [{"id":x.id,"name":x.name,"kind":x.kind,"prep_note":x.prep_note} for x in db.scalars(select(PortalLabTest).order_by(PortalLabTest.name)).all()]
def lab_detail(db,r):
    d=lab_brief(db,r);d.update({"appointment_id":r.appointment_id,"notes":r.notes,"results":r.results or [],"findings":r.findings,"impression":r.impression,"comments":r.comments,"reported_by_name":r.reported_by_name,"files":[{"id":f.id,"kind":"pdf" if f.content_type=="application/pdf" else "image","caption":f.name,"content_type":f.content_type,"size":f.size} for f in db.scalars(select(PortalLabReportFile).where(PortalLabReportFile.report_id==r.id)).all()]});return d
@router.get("/lab-reports")
def labs(status:str="",limit:int=25,offset:int=0,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    rows=db.scalars(select(PortalLabReport).where(PortalLabReport.requested_by_doctor_id==user.id).order_by(PortalLabReport.created_at.desc())).all();rows=[x for x in rows if not status or x.status==status];return {"items":[lab_detail(db,x) for x in rows[offset:offset+min(max(limit,1),100)]],"total":len(rows)}
@router.post("/lab-reports",status_code=201)
async def create_lab(request:Request,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    try:b=await request.json();pid=b["patient_id"];tid=b["test_id"];notes=b.get("notes","");aid=b.get("appointment_id")
    except Exception:fail(422,"VALIDATION_ERROR")
    if type(pid)is not int or type(tid)is not int or not isinstance(notes,str) or len(notes)>500:fail(422,"VALIDATION_ERROR")
    test=db.get(PortalLabTest,tid)
    if not test or not related(db,user.id,pid):fail(404,"NOT_FOUND")
    if aid is not None:
        a=get_appt(db,user.id,aid)
        if a.patient_id!=pid:fail(404,"NOT_FOUND")
    r=PortalLabReport(test_id=tid,test_name=test.name,kind=test.kind,patient_id=pid,requested_by_doctor_id=user.id,appointment_id=aid,status="requested",notes=notes);db.add(r);db.flush();r.report_no=("LAB-" if test.kind=="lab" else "RAD-")+str(1000+r.id);db.commit();return lab_detail(db,r)
@router.get("/lab-reports/{report_id}")
def get_lab(report_id:int,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    r=db.scalar(select(PortalLabReport).where(PortalLabReport.id==report_id,PortalLabReport.requested_by_doctor_id==user.id))
    if not r:fail(404,"NOT_FOUND")
    return lab_detail(db,r)
@router.get("/lab-reports/{report_id}/files/{file_id}")
def get_file(report_id:int,file_id:int,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    r=db.scalar(select(PortalLabReport).where(PortalLabReport.id==report_id,PortalLabReport.requested_by_doctor_id==user.id));f=db.get(PortalLabReportFile,file_id)
    if not r or not f or f.report_id!=r.id:fail(404,"NOT_FOUND")
    return Response(content=f.data,media_type=f.content_type)

SUMMARY_KEYS=("patient_overview","chief_complaint","medical_history","surgical_history","medications","allergies","family_history","social_history","vitals_and_results","assessment_and_plan")
@router.post("/patients/{patient_id}/summary")
async def summary(patient_id:int,appointment_id:int|None=None,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    from app.services.medical_assistant_client import summarize_patient
    if not related(db,user.id,patient_id):fail(404,"NOT_FOUND")
    if appointment_id is not None and not db.scalar(select(PortalAppointment).where(PortalAppointment.id==appointment_id,PortalAppointment.doctor_id==user.id,PortalAppointment.patient_id==patient_id)):fail(404,"NOT_FOUND")
    try:remote=await summarize_patient(str(patient_id),str(user.id),str(appointment_id) if appointment_id is not None else None)
    except MedicalAssistantError:fail(503,"SUMMARY_UNAVAILABLE")
    digest=str(remote["id"]);old=db.scalar(select(PortalClinicalSummary).where(PortalClinicalSummary.doctor_id==user.id,PortalClinicalSummary.patient_id==patient_id,PortalClinicalSummary.appointment_id==appointment_id,PortalClinicalSummary.source_hash==digest))
    if old:return {"id":old.id,"created_at":iso(old.created_at),"cached":True,"fields":old.fields}
    fields={k:(remote["fields"].get(k) or "Not documented in the provided records") for k in SUMMARY_KEYS}; row=PortalClinicalSummary(doctor_id=user.id,patient_id=patient_id,appointment_id=appointment_id,source_hash=digest,fields=fields);db.add(row);db.commit();return {"id":row.id,"created_at":iso(row.created_at),"cached":False,"fields":fields}
