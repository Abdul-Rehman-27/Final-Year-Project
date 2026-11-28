"""Doctor portal API vs docs/TASK_DOCTOR_PORTAL.md section 4 (contract + domain rules)."""
import pytest

from app.models.portal import PortalLabReportFile, PortalLabReport


def setup_basic(w):
    doc = w.doctor(); pat = w.user("patient", name="Ayesha Khan")
    return doc, pat, w.headers(doc)


def test_role_guard(world):
    doc, pat, h = setup_basic(world)
    assert world.client.get("/api/v1/doctor/profile").status_code == 401
    assert world.client.get("/api/v1/doctor/profile", headers=world.headers(pat)).status_code == 403
    r = world.client.get("/api/v1/doctor/profile", headers=h).json()
    assert r == {"id": doc.id, "full_name": doc.full_name, "department": "Cardiology", "specialty": "Cardiologist"}


def test_hospital_info(world):
    _, _, h = setup_basic(world)
    r = world.client.get("/api/v1/doctor/hospital-info", headers=h).json()
    assert set(r) == {"name", "address", "phone", "email", "open_hours", "timezone", "grace_minutes"}
    assert r["grace_minutes"] == 5


def test_schedule_roundtrip_and_validation(world):
    _, _, h = setup_basic(world)
    days = world.client.get("/api/v1/doctor/schedule", headers=h).json()["days"]
    assert [d["weekday"] for d in days] == list(range(7)) and not any(d["is_active"] for d in days)
    days[3] = {"weekday": 3, "is_active": True, "start_time": "10:30", "end_time": "12:45", "slot_minutes": 45, "room_label": "R1"}
    assert world.client.put("/api/v1/doctor/schedule", headers=h, json={"days": days}).json()["days"][3]["slot_minutes"] == 45
    bad = [dict(days[3], slot_minutes=20), dict(days[3], start_time="13:00"), dict(days[3], room_label="x" * 41),
           dict(days[3], end_time="10:40")]
    for b in bad:
        d2 = list(days); d2[3] = b
        r = world.client.put("/api/v1/doctor/schedule", headers=h, json={"days": d2})
        assert r.status_code == 422 and r.json()["detail"] == "SCHEDULE_INVALID"
    assert world.client.put("/api/v1/doctor/schedule", headers=h, json={"days": days[:6]}).json()["detail"] == "SCHEDULE_INVALID"
    dup = list(days); dup[1] = dict(dup[1], weekday=0)
    assert world.client.put("/api/v1/doctor/schedule", headers=h, json={"days": dup}).status_code == 422


def test_queue_checkin_and_call_rules(world):
    doc, pat, h = setup_basic(world); c = world.client
    p2 = world.user("patient", name="Bilal Ahmed")
    a1 = world.appt(pat, doc, minutes=-3, checked=-2)    # waiting
    a2 = world.appt(p2, doc, minutes=-2)                  # holding (within grace, not checked in)
    pend = world.appt(pat, doc, minutes=5, status="pending")
    q = c.get("/api/v1/doctor/queue", headers=h).json()
    assert [x["id"] for x in q["items"]] == [a1.id, a2.id] or [x["id"] for x in q["items"]] == [a2.id, a1.id]
    first = next(x for x in q["items"] if x["id"] == a1.id)
    assert first["queue_state"] == "waiting" and first["position"] == 1
    # a1 starts before a2 so a2 (holding) does not block a1
    assert first["can_call"] is True
    assert pend.id not in [x["id"] for x in q["items"]]
    # check-in rules
    assert c.post(f"/api/v1/doctor/appointments/{a1.id}/check-in", headers=h).json()["detail"] == "ALREADY_CHECKED_IN"
    assert c.post(f"/api/v1/doctor/appointments/{pend.id}/check-in", headers=h).json()["detail"] == "INVALID_TRANSITION"
    future = world.appt(pat, doc, days=3)
    assert c.post(f"/api/v1/doctor/appointments/{future.id}/check-in", headers=h).json()["detail"] == "NOT_TODAY"
    ok = c.post(f"/api/v1/doctor/appointments/{a2.id}/check-in", headers=h)
    assert ok.status_code == 200 and ok.json()["queue_state"] == "waiting"
    # call: a2 is not next
    r = c.patch(f"/api/v1/doctor/appointments/{a2.id}/visit-status", headers=h, json={"visit_status": "in_progress"})
    assert r.status_code == 409 and r.json()["detail"] == "NOT_NEXT"
    r = c.patch(f"/api/v1/doctor/appointments/{a1.id}/visit-status", headers=h, json={"visit_status": "in_progress"})
    assert r.status_code == 200 and r.json()["visit_status"] == "in_progress" and r.json()["called_at"]
    r = c.patch(f"/api/v1/doctor/appointments/{a2.id}/visit-status", headers=h, json={"visit_status": "in_progress"})
    assert r.json()["detail"] == "ALREADY_IN_PROGRESS"
    # complete
    r = c.patch(f"/api/v1/doctor/appointments/{a1.id}/visit-status", headers=h, json={"visit_status": "completed"}).json()
    assert r["status"] == "completed" and r["completed_at"]
    assert c.patch(f"/api/v1/doctor/appointments/{a1.id}/visit-status", headers=h, json={"visit_status": "incomplete"}).json()["detail"] == "INVALID_TRANSITION"
    notin = world.appt(pat, doc, minutes=1)
    assert c.patch(f"/api/v1/doctor/appointments/{notin.id}/visit-status", headers=h, json={"visit_status": "in_progress"}).json()["detail"] == "NOT_CHECKED_IN"


def test_incomplete_leaves_status_confirmed(world):
    doc, pat, h = setup_basic(world)
    a = world.appt(pat, doc, minutes=-1, checked=-1)
    r = world.client.patch(f"/api/v1/doctor/appointments/{a.id}/visit-status", headers=h, json={"visit_status": "incomplete"}).json()
    assert r["status"] == "confirmed" and r["visit_status"] == "incomplete" and r["completed_at"]


def test_queue_held_by_holding_patient(world):
    doc, pat, h = setup_basic(world); p2 = world.user("patient")
    world.appt(pat, doc, minutes=-1)                     # holding, earlier start
    late = world.appt(p2, doc, minutes=0, checked=0)     # waiting, effective=start, later than holding start
    r = world.client.patch(f"/api/v1/doctor/appointments/{late.id}/visit-status", headers=h, json={"visit_status": "in_progress"})
    assert r.json()["detail"] == "QUEUE_HELD"


def test_appointment_scoping_and_detail(world):
    doc, pat, h = setup_basic(world); other = world.doctor(name="Dr. Other")
    a = world.appt(pat, other, minutes=5)
    assert world.client.get(f"/api/v1/doctor/appointments/{a.id}", headers=h).json()["detail"] == "NOT_FOUND"
    mine = world.appt(pat, doc, minutes=5)
    d = world.client.get(f"/api/v1/doctor/appointments/{mine.id}", headers=h).json()
    assert d["booking_no"] == f"APT-{mine.id:04d}" and d["patient"]["full_name"] == "Ayesha Khan"
    assert d["source"] == "portal" and d["queue_state"] in ("later", "holding") and d["token_no"] == "C-01"


def test_prescription_rules(world):
    doc, pat, h = setup_basic(world); c = world.client
    a = world.appt(pat, doc, minutes=-1, checked=-1)
    body = {"items": [{"medicine": "Paracetamol 500 mg", "dosage": "1 tablet", "timing": "Every 8 hours"}], "duration_days": 5, "instructions": "After food"}
    assert c.post(f"/api/v1/doctor/appointments/{a.id}/prescriptions", headers=h, json=body).json()["detail"] == "VISIT_NOT_IN_PROGRESS"
    c.patch(f"/api/v1/doctor/appointments/{a.id}/visit-status", headers=h, json={"visit_status": "in_progress"})
    r = c.post(f"/api/v1/doctor/appointments/{a.id}/prescriptions", headers=h, json=body)
    assert r.status_code == 201
    rx = r.json(); assert rx["rx_no"] == "Rx-1001" and rx["status"] == "active" and rx["items"][0]["medicine"] == "Paracetamol 500 mg"
    assert rx["appointment"]["id"] == a.id and rx["doctor"]["department"] == "Cardiology"
    for bad in (dict(body, items=[]), dict(body, duration_days=0), dict(body, duration_days=366), dict(body, instructions="x" * 1001),
                dict(body, items=[{"medicine": "x" * 101, "dosage": "a", "timing": "b"}]), dict(body, items=[body["items"][0]] * 11)):
        r = c.post(f"/api/v1/doctor/appointments/{a.id}/prescriptions", headers=h, json=bad)
        assert r.status_code == 422, bad
    lst = c.get("/api/v1/doctor/prescriptions", headers=h).json()
    assert lst["total"] == 1 and lst["items"][0]["patient_name"] == "Ayesha Khan"
    assert c.get("/api/v1/doctor/prescriptions?q=zzz", headers=h).json()["total"] == 0
    assert c.get(f"/api/v1/doctor/prescriptions/{rx['id']}", headers=h).json()["rx_no"] == "Rx-1001"
    assert c.get("/api/v1/doctor/prescriptions/999", headers=h).json()["detail"] == "NOT_FOUND"


def test_prescription_date_filters(world):
    from datetime import date, timedelta
    doc, pat, h = setup_basic(world); c = world.client
    a = world.appt(pat, doc, minutes=-1, checked=-1)
    c.patch(f"/api/v1/doctor/appointments/{a.id}/visit-status", headers=h, json={"visit_status": "in_progress"})
    c.post(f"/api/v1/doctor/appointments/{a.id}/prescriptions", headers=h, json={"items": [{"medicine": "m", "dosage": "d", "timing": "t"}], "duration_days": 3, "instructions": ""})
    tomorrow = (date.today() + timedelta(days=2)).isoformat(); old = (date.today() - timedelta(days=30)).isoformat()
    assert c.get(f"/api/v1/doctor/prescriptions?from={tomorrow}", headers=h).json()["total"] == 0
    assert c.get(f"/api/v1/doctor/prescriptions?from={old}&to={tomorrow}", headers=h).json()["total"] == 1


def test_patient_access_scoping_and_profile_all_doctors(world):
    doc, pat, h = setup_basic(world); other = world.doctor(name="Dr. Other", department="Dermatology"); c = world.client
    stranger = world.user("patient", name="Nobody")
    assert c.get(f"/api/v1/doctor/patients/{stranger.id}", headers=h).json()["detail"] == "NOT_FOUND"
    assert c.get(f"/api/v1/doctor/patients/{stranger.id}/summary-base", headers=h).status_code == 404
    world.appt(pat, doc, days=-3, status="completed", visit="completed")
    world.appt(pat, other, days=-9, status="completed", visit="completed")
    p = c.get(f"/api/v1/doctor/patients/{pat.id}", headers=h).json()
    assert {x["doctor_name"] for x in p["appointments"]} == {doc.full_name, "Dr. Other"}   # all doctors
    assert {x["department"] for x in p["appointments"]} == {"Cardiology", "Dermatology"}
    assert p["email"] == pat.email
    opts = c.get("/api/v1/doctor/patients/options", headers=h).json()
    assert opts == [{"id": pat.id, "full_name": "Ayesha Khan", "age": opts[0]["age"]}]
    lst = c.get("/api/v1/doctor/patients", headers=h).json()
    assert lst["total"] == 1 and lst["items"][0]["last_visit"]
    assert c.get("/api/v1/doctor/patients?q=zzz", headers=h).json()["total"] == 0
    sb = c.get(f"/api/v1/doctor/patients/{pat.id}/summary-base", headers=h).json()
    assert sb["snapshot"]["name"] == "Ayesha Khan" and len(sb["past_appointments"]) == 2
    assert {x["doctor_name"] for x in sb["past_appointments"]} == {doc.full_name, "Dr. Other"}
    assert c.get(f"/api/v1/doctor/patients/{pat.id}/summary-base?appointment_id=99999", headers=h).status_code == 404


def test_lab_flow_and_files_shape(world):
    doc, pat, h = setup_basic(world); c = world.client
    other = world.doctor(name="Dr. Other")
    a = world.appt(pat, doc, minutes=5)
    tests = c.get("/api/v1/doctor/lab-tests", headers=h).json()
    assert {t["name"] for t in tests} >= {"Complete blood count", "Chest X-ray"}
    cbc = next(t for t in tests if t["name"] == "Complete blood count"); xr = next(t for t in tests if t["name"] == "Chest X-ray")
    r = c.post("/api/v1/doctor/lab-reports", headers=h, json={"patient_id": pat.id, "test_id": cbc["id"], "notes": "fasting", "appointment_id": a.id})
    assert r.status_code == 201 and r.json()["report_no"].startswith("LAB-") and r.json()["status"] == "requested"
    rr = c.post("/api/v1/doctor/lab-reports", headers=h, json={"patient_id": pat.id, "test_id": xr["id"]}).json()
    assert rr["report_no"].startswith("RAD-") and rr["kind"] == "radiology"
    stranger = world.user("patient")
    assert c.post("/api/v1/doctor/lab-reports", headers=h, json={"patient_id": stranger.id, "test_id": cbc["id"]}).status_code == 404
    other_a = world.appt(stranger, doc, minutes=9)
    assert c.post("/api/v1/doctor/lab-reports", headers=h, json={"patient_id": pat.id, "test_id": cbc["id"], "appointment_id": other_a.id}).status_code == 404
    assert c.post("/api/v1/doctor/lab-reports", headers=h, json={"patient_id": pat.id, "test_id": cbc["id"], "notes": "x" * 501}).status_code == 422
    assert c.get("/api/v1/doctor/lab-reports?status=ready", headers=h).json()["total"] == 0
    assert c.get("/api/v1/doctor/lab-reports", headers=h).json()["total"] == 2
    # files: contract says {id, kind: image|pdf, caption}
    rep = world.db.get(PortalLabReport, rr["id"]); rep.status = "ready"
    world.db.add(PortalLabReportFile(report_id=rep.id, name="PA view", content_type="image/png", size=3, data=b"abc")); world.db.commit()
    d = c.get(f"/api/v1/doctor/lab-reports/{rep.id}", headers=h).json()
    assert d["files"][0]["kind"] == "image" and d["files"][0]["caption"] == "PA view"
    assert c.get(f"/api/v1/doctor/lab-reports/{rep.id}/files/{d['files'][0]['id']}", headers=h).content == b"abc"
    # other doctor cannot see it
    assert c.get(f"/api/v1/doctor/lab-reports/{rep.id}", headers=world.headers(other)).status_code == 404


def test_dashboard_shape(world):
    doc, pat, h = setup_basic(world)
    world.appt(pat, doc, minutes=-1, checked=-1); world.appt(pat, doc, days=2)
    d = world.client.get("/api/v1/doctor/dashboard", headers=h).json()
    assert set(d) == {"server_now", "stats", "today", "upcoming", "schedule", "recent_tests", "recent_prescriptions"}
    assert d["stats"]["total_patients"] == 1 and d["stats"]["in_queue_now"] == 1 and d["stats"]["next_waiting"]["token_no"]
    assert len(d["schedule"]) == 7 and len(d["upcoming"]) == 1


def test_summary_unavailable_maps_to_503(world, monkeypatch):
    doc, pat, h = setup_basic(world); world.appt(pat, doc, days=-1, status="completed", visit="completed")
    from app.services import medical_assistant_client as mac

    async def boom(*a, **k):
        raise mac.MedicalAssistantError("down")
    monkeypatch.setattr(mac, "summarize_patient", boom)
    r = world.client.post(f"/api/v1/doctor/patients/{pat.id}/summary", headers=h)
    assert r.status_code == 503 and r.json()["detail"] == "SUMMARY_UNAVAILABLE"
