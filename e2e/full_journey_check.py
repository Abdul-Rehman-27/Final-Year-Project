"""P5f - final acceptance journey in a real browser:
patient books -> doctor checks in -> calls -> prescription + lab request -> completes -> recommends follow-up ->
patient accepts -> follow-up confirmed -> both portals get the right notifications.
SETUP (not under test, done through the API/DB): the doctor opens an extra session today so a same-day booking is possible,
and today's seeded demo queue is closed out (marked incomplete) so the new patient is next in line."""
import json, re, sys, urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
sys.path.insert(0, "/home/claude/proj/e2e")
from common import *
from playwright.sync_api import sync_playwright

API = "http://localhost:8000/api/v1"
def api(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    with urllib.request.urlopen(req) as r: return json.loads(r.read() or b"null")

tz = ZoneInfo("Asia/Karachi"); now = datetime.now(tz)
start = (now + timedelta(minutes=25)).replace(second=0, microsecond=0); start += timedelta(minutes=(-start.minute) % 15)
end = start + timedelta(minutes=90); assert end.date() == now.date(), "run earlier in the day (needs a same-day window)"
tok = api("POST", "/auth/login", body={"email": "imran.malik@cityhospital.pk", "password": "Doctor@12345", "role": "doctor"})["access_token"]
api("PUT", f"/doctor/schedule/exceptions/{now.date().isoformat()}", tok, {"kind": "extra_session", "sessions": [{"start_time": start.strftime("%H:%M"), "end_time": end.strftime("%H:%M"), "slot_minutes": 15, "room_label": "Floor 2 · Room 12"}]})
c = sqlite3.connect(DB); c.execute("update portal_appointments set visit_status='incomplete', completed_at=checked_in_at where visit_status in ('scheduled','in_progress') and status='confirmed' and starts_at < ?", ((datetime.utcnow() + timedelta(hours=3)).isoformat(sep=" "),)); c.commit(); c.close()

errors = []; S = {}
with sync_playwright() as p:
    br = p.chromium.launch()
    pat = new_page(br, errors); doc = new_page(br, errors)
    patient_email = "usman.tariq@example.com"
    login(pat, "Patient", patient_email, "Patient@12345"); login(doc, "Doctor", "imran.malik@cityhospital.pk", "Doctor@12345")
    uid = db("select id from users where email=?", patient_email)[0]["id"]

    @step("1 Patient books a same-day visit in the patient portal (UI)")
    def _():
        pat.goto(B + "/patient/appointments"); pat.wait_for_timeout(2000)
        pat.locator("#appointment-department").select_option(label="Cardiology"); pat.wait_for_timeout(500)
        pat.locator("#appointment-doctor").select_option(index=0); pat.locator("#appointment-date").fill(now.date().isoformat()); pat.wait_for_timeout(1500)
        chips = pat.locator("[role=group] button"); assert chips.count() > 0, "no free slot chips"
        chips.last.click(); pat.get_by_role("button", name=re.compile("confirm booking", re.I)).click(); pat.wait_for_timeout(2000)
        a = db("select * from portal_appointments where patient_id=? and source='portal' and is_followup=0 and starts_at > ? order by id desc", uid, datetime.utcnow().isoformat(sep=" "))
        assert a and a[0]["status"] == "confirmed" and a[0]["token_no"] and a[0]["booking_no"], a
        S["appt"] = a[0]["id"]

    @step("1b Time passes: the booked visit time arrives (simulated by moving the stored start to 1 minute ago)")
    def _():
        c = sqlite3.connect(DB); c.execute("update portal_appointments set starts_at=? where id=?", ((datetime.utcnow() - timedelta(minutes=1)).isoformat(sep=" "), S["appt"])); c.commit(); c.close()

    @step("2 Doctor checks the patient in (UI)")
    def _():
        doc.goto(B + "/doctor/queue"); doc.wait_for_timeout(2000)
        row = doc.locator("div,li,tr").filter(has_text="Usman Tariq").filter(has=doc.get_by_role("button", name=re.compile("check in", re.I))).last
        row.get_by_role("button", name=re.compile("check in", re.I)).click(); doc.wait_for_timeout(1500)
        assert db("select checked_in_at from portal_appointments where id=?", S["appt"])[0]["checked_in_at"]

    @step("3 Doctor calls the patient (UI)")
    def _():
        doc.goto(B + "/doctor/queue"); doc.wait_for_timeout(1500)
        enabled = [b for b in doc.get_by_role("button", name=re.compile("call patient", re.I)).all() if b.is_enabled()]; assert enabled
        enabled[0].click(); doc.wait_for_timeout(1500)
        assert db("select visit_status from portal_appointments where id=?", S["appt"])[0]["visit_status"] == "in_progress"

    @step("4 Doctor writes a prescription (UI)")
    def _():
        doc.goto(f"{B}/doctor/queue/{S['appt']}"); doc.wait_for_timeout(1500)
        doc.get_by_role("link", name=re.compile("write prescription", re.I)).click(); doc.wait_for_timeout(1000)
        ins = doc.locator("input[aria-label$=' 1']"); ins.nth(0).fill("Metformin"); ins.nth(1).fill("500 mg"); ins.nth(2).fill("Once daily")
        doc.locator("input[type=number]").fill("14"); doc.get_by_role("button", name=re.compile("save", re.I)).click(); doc.wait_for_timeout(2000)
        assert len(db("select id from portal_prescriptions where appointment_id=?", S["appt"])) == 1

    @step("5 Doctor requests a laboratory test (UI)")
    def _():
        doc.goto(f"{B}/doctor/queue/{S['appt']}"); doc.wait_for_timeout(1500)
        doc.get_by_role("link", name=re.compile("request.*test", re.I)).click(); doc.wait_for_timeout(1500)
        doc.locator("#lab-test").select_option(index=1)
        doc.get_by_role("button", name=re.compile("^(request|send|submit|create)", re.I)).last.click(); doc.wait_for_timeout(2000)
        assert len(db("select id from portal_lab_reports where appointment_id=?", S["appt"])) == 1

    @step("6 Doctor completes the consultation (UI); visit + appointment status agree")
    def _():
        doc.goto(f"{B}/doctor/queue/{S['appt']}"); doc.wait_for_timeout(1500)
        doc.get_by_role("button", name=re.compile("mark.*complete", re.I)).click()
        doc.get_by_role("dialog").get_by_role("button", name=re.compile("confirm", re.I)).click(); doc.wait_for_timeout(2000)
        a = db("select visit_status,status from portal_appointments where id=?", S["appt"])[0]; assert (a["visit_status"], a["status"]) == ("completed", "completed"), a

    @step("7 Doctor recommends a follow-up (UI; time chosen from the VISIBLE slot dropdown)")
    def _():
        doc.goto(f"{B}/doctor/queue/{S['appt']}"); doc.wait_for_timeout(2000)
        doc.get_by_role("button", name=re.compile("recommend follow-up", re.I)).click()
        d = now.date() + timedelta(days=1)
        while d.weekday() not in (0, 3): d += timedelta(days=1)
        doc.locator("input[type=date]").fill(d.isoformat()); doc.wait_for_timeout(1500)
        sel = doc.locator("select:visible").last; assert sel.locator("option").count() > 1, "no free slots offered"
        sel.select_option(index=1)
        doc.get_by_role("button", name=re.compile("send recommendation", re.I)).click(); doc.wait_for_timeout(2000)
        r = db("select * from portal_followup_recommendations where source_appointment_id=?", S["appt"]); assert len(r) == 1 and r[0]["status"] == "pending", r
        S["rec"] = r[0]["id"]

    @step("8 Patient receives the notification (bell) and sees the recommendation")
    def _():
        pat.goto(B + "/patient/appointments"); pat.wait_for_timeout(2500)
        bell = pat.locator("button[aria-label*='otif']:visible").first
        assert re.search(r"\((\d+)\)", bell.get_attribute("aria-label")), bell.get_attribute("aria-label")
        assert db("select count(*) c from portal_notifications where user_id=? and read_at is null", uid)[0]["c"] > 0
        assert pat.get_by_role("button", name=re.compile("^accept$", re.I)).count() > 0

    @step("9 Patient accepts; follow-up appointment is confirmed with booking no + token")
    def _():
        pat.get_by_role("button", name=re.compile("^accept$", re.I)).first.click(); pat.wait_for_timeout(2500)
        assert db("select status from portal_followup_recommendations where id=?", S["rec"])[0]["status"] == "accepted"
        f = db("select * from portal_appointments where followup_of_appointment_id=?", S["appt"]); assert len(f) == 1, f
        assert f[0]["status"] == "confirmed" and f[0]["is_followup"] == 1 and f[0]["token_no"] and f[0]["booking_no"] and f[0]["patient_id"] == uid, f
        S["fu"] = f[0]["id"]
        pat.goto(B + "/patient/appointments"); pat.wait_for_timeout(2000); assert f[0]["booking_no"] in pat.inner_text("main") or "Confirmed" in pat.inner_text("main")

    @step("10 Doctor gets the 'accepted' notification (DB + bell) and sees the booked follow-up")
    def _():
        n = db("select * from portal_notifications where user_id=(select doctor_id from portal_appointments where id=?) and read_at is null order by id desc", S["fu"]); assert n, "no doctor notification"
        doc.goto(f"{B}/doctor/queue/{S['appt']}"); doc.wait_for_timeout(2500)
        bell = doc.locator("button[aria-label*='otif']:visible").first; assert re.search(r"\((\d+)\)", bell.get_attribute("aria-label")), bell.get_attribute("aria-label")
        bell.click(); doc.wait_for_timeout(800); assert doc.get_by_role("dialog").inner_text().strip()
        doc.keyboard.press("Escape"); doc.goto(f"{B}/doctor/queue/{S['appt']}"); doc.wait_for_timeout(2000)
        assert "accepted" in doc.inner_text("main").lower()
    br.close()
print("API 4xx/5xx during run:", errors)
sys.exit(0 if summary() else 1)
