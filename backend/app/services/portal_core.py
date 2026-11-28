from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select

KARACHI = ZoneInfo("Asia/Karachi")

def as_utc(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value

def utcnow(): return datetime.now(timezone.utc)
def local_day(value): return as_utc(value).astimezone(KARACHI).date()
def iso(value): return as_utc(value).isoformat() if value else None
def age_on(dob, today=None):
    if not dob: return None
    today = today or datetime.now(KARACHI).date()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

def assign_token(db, appointment):
    """token_no = first letter of the doctor's department (A fallback) + '-' + 2-digit per-doctor/day sequence."""
    from app.models.admin import AdminDepartment, AdminStaffProfile
    from app.models.portal import PortalAppointment
    day = local_day(appointment.starts_at)
    staff = db.get(AdminStaffProfile, appointment.doctor_id)
    dep = db.get(AdminDepartment, staff.department_id) if staff and staff.department_id else None
    letter = (dep.name.strip()[:1].upper() if dep and dep.name.strip() else "") or "A"
    used = db.scalars(select(PortalAppointment.token_no).where(PortalAppointment.doctor_id == appointment.doctor_id, PortalAppointment.token_date == day, PortalAppointment.token_no.is_not(None))).all()
    seq = max((int(t.split("-")[1]) for t in used if "-" in t and t.split("-")[1].isdigit()), default=0) + 1
    appointment.token_date, appointment.token_no = day, f"{letter}-{seq:02d}"

def build_queue(appointments, now, grace_minutes):
    now = as_utc(now); rows = []
    for a in appointments:
        start = as_utc(a.starts_at); checked = as_utc(a.checked_in_at); grace = start + timedelta(minutes=grace_minutes)
        if a.visit_status == "completed": state = "completed"
        elif a.visit_status == "incomplete": state = "incomplete"
        elif a.visit_status == "in_progress": state = "in_progress"
        elif checked: state = "waiting"
        elif now < start: state = "later"
        elif now < grace: state = "holding"
        else: state = "grace_expired"
        rows.append({"appointment": a, "state": state, "start": start, "checked": checked, "grace": grace, "effective": checked if checked and checked > grace else start})
    progress = sorted([x for x in rows if x["state"] == "in_progress"], key=lambda x: as_utc(x["appointment"].called_at) or x["start"])
    waiting = sorted([x for x in rows if x["state"] == "waiting"], key=lambda x: (x["effective"], x["checked"] or x["start"], x["appointment"].id))
    holding = [x for x in rows if x["state"] == "holding"]
    for x in rows: x.update(position=None, can_call=False, call_blocked_reason=None, blocked_by_name=None)
    for i, x in enumerate(progress + waiting): x["position"] = i + 1
    for i, w in enumerate(waiting):
        blockers = [h for h in holding if h["start"] <= w["effective"]]
        blocker = sorted(blockers, key=lambda x: x["start"])[0] if blockers else None
        if progress: reason = "in_progress"
        elif blocker: reason = "held"
        elif i: reason = "not_next"
        else: reason = None
        w["can_call"] = reason is None; w["call_blocked_reason"] = reason
        w["blocked_by_name"] = getattr(blocker["appointment"], "patient_name", None) if blocker else None
    visible = progress + sorted([x for x in rows if x["state"] in ("waiting", "holding")], key=lambda x: (x["start"] if x["state"] == "holding" else x["effective"], x["appointment"].id)) + sorted([x for x in rows if x["state"] in ("completed", "incomplete")], key=lambda x: as_utc(x["appointment"].completed_at) or x["start"])
    expected = sorted([x for x in rows if x["state"] in ("holding", "later", "grace_expired")], key=lambda x: x["start"])
    return {"entries": rows, "items": visible, "expected": expected, "counts": {"all":len(visible), "waiting":len(waiting), "in_progress":len(progress), "completed":sum(x["state"]=="completed" for x in rows), "incomplete":sum(x["state"]=="incomplete" for x in rows)}}
