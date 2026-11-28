"""Patient portal API: booking flow, ownership isolation, prescriptions, labs, integration with the doctor portal."""
from datetime import datetime, timedelta, timezone

from app.models.portal import PortalAppointment, PortalDoctorSchedule, PortalLabReport, PortalLabReportFile, PortalPrescription, PortalPrescriptionItem
from app.services.portal_core import KARACHI

P = "/api/v1/patient"


def tomorrow(n=1):
    return (datetime.now(KARACHI) + timedelta(days=n)).date()


def schedule(w, doc, day, start="10:30", end="12:45", slot=45):
    w.db.add(PortalDoctorSchedule(doctor_id=doc.id, weekday=day.weekday(), is_active=True, start_time=start, end_time=end, slot_minutes=slot, room_label="Floor 2 · Room 12"))
    w.db.commit()


def setup(world):
    doc = world.doctor(); pat = world.user("patient", name="Ayesha Khan"); day = tomorrow(); schedule(world, doc, day)
    return doc, pat, world.headers(pat), day.isoformat()


def test_role_guard(world):
    doc = world.doctor()
    assert world.client.get(f"{P}/dashboard").status_code == 401
    assert world.client.get(f"{P}/dashboard", headers=world.headers(doc)).status_code == 403


def test_lookups_departments_doctors_slots(world):
    doc, pat, h, day = setup(world); c = world.client
    world.doctor(name="Dr. NoSchedule", department="Dermatology")           # not bookable (no schedule)
    deps = c.get(f"{P}/departments", headers=h).json()
    assert [d["name"] for d in deps] == ["Cardiology"]
    docs = c.get(f"{P}/doctors?department_id={deps[0]['id']}", headers=h).json()
    assert [d["id"] for d in docs] == [doc.id] and docs[0]["department"] == "Cardiology"
    s = c.get(f"{P}/doctors/{doc.id}/slots?date={day}", headers=h).json()
    assert s["slots"] == ["10:30", "11:15", "12:00"] and s["room_label"] == "Floor 2 · Room 12"
    off = (tomorrow(2)).isoformat() if tomorrow(2).weekday() != tomorrow().weekday() else tomorrow(3).isoformat()
    assert c.get(f"{P}/doctors/{doc.id}/slots?date={off}", headers=h).json()["slots"] == []
    assert c.get(f"{P}/doctors/{doc.id}/slots?date=nope", headers=h).status_code == 422
    assert c.get(f"{P}/doctors/9999/slots?date={day}", headers=h).status_code == 404


def test_book_auto_confirms_and_blocks_double_booking(world):
    doc, pat, h, day = setup(world); c = world.client; other = world.user("patient", name="Bilal")
    r = c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day, "time": "11:15"})
    assert r.status_code == 201
    a = r.json()
    assert a["status"] == "confirmed" and a["token_no"] == "C-01" and a["booking_no"] == f"APT-{a['id']:04d}"
    assert a["group"] == "upcoming" and a["doctor_name"] == doc.full_name and a["department"] == "Cardiology" and a["room_label"] == "Floor 2 · Room 12"
    assert "11:15" not in c.get(f"{P}/doctors/{doc.id}/slots?date={day}", headers=h).json()["slots"]
    r2 = c.post(f"{P}/appointments", headers=world.headers(other), json={"doctor_id": doc.id, "date": day, "time": "11:15"})
    assert r2.status_code == 409 and r2.json()["detail"] == "SLOT_UNAVAILABLE"
    r3 = c.post(f"{P}/appointments", headers=world.headers(other), json={"doctor_id": doc.id, "date": day, "time": "12:00"})
    assert r3.json()["token_no"] == "C-02"
    # not a real slot / past / garbage / unknown doctor
    assert c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day, "time": "11:16"}).json()["detail"] == "SLOT_UNAVAILABLE"
    assert c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": "2020-01-01", "time": "10:30"}).json()["detail"] == "SLOT_IN_PAST"
    assert c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": "x", "time": "10:30"}).status_code == 422
    assert c.post(f"{P}/appointments", headers=h, json={"doctor_id": 9999, "date": day, "time": "10:30"}).status_code == 404
    assert c.post(f"{P}/appointments", headers=h, json={"time": "10:30"}).json()["detail"] == "VALIDATION_ERROR"


def test_booking_visible_to_doctor_portal(world):
    doc, pat, h, day = setup(world); c = world.client
    a = c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day, "time": "10:30"}).json()
    d = c.get(f"/api/v1/doctor/appointments/{a['id']}", headers=world.headers(doc)).json()
    assert d["status"] == "confirmed" and d["token_no"] == "C-01" and d["patient"]["full_name"] == "Ayesha Khan" and d["source"] == "portal"
    assert c.get("/api/v1/doctor/patients", headers=world.headers(doc)).json()["total"] == 1   # now a related patient


def test_list_groups_and_isolation(world):
    doc, pat, h, day = setup(world); c = world.client; other = world.user("patient")
    world.appt(pat, doc, days=-5, status="completed", visit="completed")
    world.appt(pat, doc, days=-8, status="cancelled", token=False)
    mine = c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day, "time": "10:30"}).json()
    world.appt(other, doc, days=3)
    items = c.get(f"{P}/appointments", headers=h).json()["items"]
    assert [x["group"] for x in items] == ["upcoming", "past", "past"] and items[0]["id"] == mine["id"]
    assert {x["status"] for x in items} == {"confirmed", "completed", "cancelled"}
    assert c.get(f"{P}/appointments/{mine['id']}/token", headers=world.headers(other)).status_code == 404
    assert c.post(f"{P}/appointments/{mine['id']}/cancel", headers=world.headers(other)).status_code == 404
    assert c.patch(f"{P}/appointments/{mine['id']}", headers=world.headers(other), json={"date": day, "time": "12:00"}).status_code == 404


def test_reschedule_rules(world):
    doc, pat, h, day = setup(world); c = world.client
    a = c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day, "time": "10:30"}).json()
    r = c.patch(f"{P}/appointments/{a['id']}", headers=h, json={"date": day, "time": "12:00"}).json()
    assert r["token_no"] == a["token_no"] and r["starts_at"] != a["starts_at"]            # same day/doctor keeps token
    assert "10:30" in c.get(f"{P}/doctors/{doc.id}/slots?date={day}", headers=h).json()["slots"]   # old slot freed
    same = c.patch(f"{P}/appointments/{a['id']}", headers=h, json={"date": day, "time": "12:00"})   # moving onto own slot is fine
    assert same.status_code == 200
    # a different day gets a fresh token
    day2 = tomorrow(2); schedule(world, doc, day2)
    r = c.patch(f"{P}/appointments/{a['id']}", headers=h, json={"date": day2.isoformat(), "time": "10:30"}).json()
    assert r["token_no"] == "C-01" and r["booking_no"] == a["booking_no"]
    # slot taken by someone else
    other = world.user("patient"); c.post(f"{P}/appointments", headers=world.headers(other), json={"doctor_id": doc.id, "date": day, "time": "11:15"})
    assert c.patch(f"{P}/appointments/{a['id']}", headers=h, json={"date": day, "time": "11:15"}).json()["detail"] == "SLOT_UNAVAILABLE"
    # locked once checked in
    row = world.db.get(PortalAppointment, a["id"]); row.checked_in_at = datetime.now(timezone.utc); world.db.commit()
    assert c.patch(f"{P}/appointments/{a['id']}", headers=h, json={"date": day, "time": "12:00"}).json()["detail"] == "APPOINTMENT_LOCKED"
    assert c.post(f"{P}/appointments/{a['id']}/cancel", headers=h).json()["detail"] == "APPOINTMENT_LOCKED"


def test_cancel_frees_slot_and_is_final(world):
    doc, pat, h, day = setup(world); c = world.client
    a = c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day, "time": "10:30"}).json()
    r = c.post(f"{P}/appointments/{a['id']}/cancel", headers=h).json()
    assert r["status"] == "cancelled" and r["group"] == "past" and not r["can_cancel"]
    assert "10:30" in c.get(f"{P}/doctors/{doc.id}/slots?date={day}", headers=h).json()["slots"]
    assert c.post(f"{P}/appointments/{a['id']}/cancel", headers=h).json()["detail"] == "APPOINTMENT_LOCKED"
    assert c.get(f"{P}/appointments/{a['id']}/token", headers=h).status_code == 404       # no token slip for cancelled
    again = c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day, "time": "10:30"})
    assert again.status_code == 201                                                       # slot can be re-booked


def test_token_slip(world):
    doc, pat, h, day = setup(world); c = world.client
    a = c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day, "time": "10:30"}).json()
    t = c.get(f"{P}/appointments/{a['id']}/token", headers=h).json()
    assert t["token_no"] == "C-01" and t["booking_no"] == a["booking_no"] and t["patient"]["full_name"] == "Ayesha Khan"
    assert t["room_label"] and "emergency_number" in t["hospital"]


def test_prescriptions_own_only_with_effective_status(world):
    doc, pat, h, _ = setup(world); c = world.client; other = world.user("patient")
    a = world.appt(pat, doc, days=-1, status="completed", visit="completed"); b = world.appt(other, doc, days=-1, status="completed", visit="completed")
    today = datetime.now(KARACHI).date()
    def rx(appt, who, issued, dur, no):
        r = PortalPrescription(rx_no=no, appointment_id=appt.id, patient_id=who.id, doctor_id=doc.id, issued_on=issued, duration_days=dur, status="active", instructions="After food")
        world.db.add(r); world.db.flush(); world.db.add(PortalPrescriptionItem(prescription_id=r.id, position=0, medicine="Amlodipine 5 mg", dosage="1 tablet", timing="Morning")); world.db.commit(); return r
    mine_active = rx(a, pat, today, 14, "Rx-1042"); mine_old = rx(a, pat, today - timedelta(days=30), 5, "Rx-0987"); theirs = rx(b, other, today, 5, "Rx-2000")
    items = c.get(f"{P}/prescriptions", headers=h).json()["items"]
    assert [x["rx_no"] for x in items] == ["Rx-1042", "Rx-0987"]
    assert [x["status"] for x in items] == ["active", "completed"]                       # stored 'active' becomes completed
    assert items[0]["doctor_name"] == doc.full_name and items[0]["department"] == "Cardiology" and items[0]["patient"]["full_name"] == "Ayesha Khan"
    assert items[0]["items"][0] == {"medicine": "Amlodipine 5 mg", "dosage": "1 tablet", "timing": "Morning"} and items[0]["instructions"] == "After food"
    assert c.get(f"{P}/prescriptions/{mine_active.id}", headers=h).json()["rx_no"] == "Rx-1042"
    assert c.get(f"{P}/prescriptions/{theirs.id}", headers=h).status_code == 404


def test_lab_booking_listing_and_privacy(world):
    doc, pat, h, _ = setup(world); c = world.client; other = world.user("patient")
    tests = c.get(f"{P}/lab-tests", headers=h).json(); cbc = next(t for t in tests if t["name"] == "Complete blood count")
    when = tomorrow()
    r = c.post(f"{P}/lab-reports", headers=h, json={"test_id": cbc["id"], "date": when.isoformat(), "time": "09:00", "notes": "fasting"})
    assert r.status_code == 201 and r.json()["status"] == "scheduled" and r.json()["report_no"].startswith("LAB-") and r.json()["referred_by"] is None
    assert c.post(f"{P}/lab-reports", headers=h, json={"test_id": cbc["id"], "date": "2020-01-01", "time": "09:00"}).json()["detail"] == "SLOT_IN_PAST"
    assert c.post(f"{P}/lab-reports", headers=h, json={"test_id": 9999, "date": when.isoformat(), "time": "09:00"}).status_code == 404
    assert c.post(f"{P}/lab-reports", headers=h, json={"test_id": cbc["id"], "date": when.isoformat(), "time": "09:00", "notes": "x" * 501}).status_code == 422
    # doctor-requested ready report with results + image; plus one cancelled; plus another patient's
    ready = PortalLabReport(report_no="RAD-0412", test_id=cbc["id"], test_name="Chest X-ray", kind="radiology", patient_id=pat.id, requested_by_doctor_id=doc.id,
                            status="ready", findings="Lungs are clear.", impression="No acute findings.", technique="PA and lateral", reported_by_name="Dr. Omar Sheikh",
                            results=[{"test": "Hemoglobin", "result": "13.2", "unit": "g/dL", "reference": "12.0 – 15.5", "flag": "normal"}], performed_at=datetime.now(timezone.utc))
    gone = PortalLabReport(report_no="LAB-9", test_id=cbc["id"], test_name="X", kind="lab", patient_id=pat.id, requested_by_doctor_id=doc.id, status="cancelled")
    theirs = PortalLabReport(report_no="LAB-8", test_id=cbc["id"], test_name="Y", kind="lab", patient_id=other.id, requested_by_doctor_id=doc.id, status="ready")
    world.db.add_all([ready, gone, theirs]); world.db.flush()
    world.db.add(PortalLabReportFile(report_id=ready.id, name="Figure 1 · PA view", content_type="image/png", size=3, data=b"png")); world.db.commit()
    items = c.get(f"{P}/lab-reports", headers=h).json()["items"]
    assert {x["report_no"] for x in items} == {"RAD-0412", r.json()["report_no"]}
    d = c.get(f"{P}/lab-reports/{ready.id}", headers=h).json()
    assert d["referred_by"] == doc.full_name and d["findings"] == "Lungs are clear." and d["results"][0]["flag"] == "normal" and d["patient"]["full_name"] == "Ayesha Khan"
    assert d["files"] == [{"id": d["files"][0]["id"], "kind": "image", "caption": "Figure 1 · PA view"}]
    assert c.get(f"{P}/lab-reports/{ready.id}/files/{d['files'][0]['id']}", headers=h).content == b"png"
    sched = c.get(f"{P}/lab-reports/{r.json()['id']}", headers=h).json()
    assert sched["findings"] == "" and sched["results"] == [] and sched["files"] == []      # nothing leaks before ready
    for rid in (gone.id, theirs.id):
        assert c.get(f"{P}/lab-reports/{rid}", headers=h).status_code == 404
    assert c.get(f"{P}/lab-reports/{ready.id}/files/{d['files'][0]['id']}", headers=world.headers(other)).status_code == 404


def test_patient_booked_lab_not_in_doctor_lists_and_doctor_still_works(world):
    doc, pat, h, _ = setup(world); c = world.client
    cbc = next(t for t in c.get(f"{P}/lab-tests", headers=h).json() if t["name"] == "Complete blood count")
    c.post(f"{P}/lab-reports", headers=h, json={"test_id": cbc["id"], "date": tomorrow().isoformat(), "time": "09:00"})
    assert c.get("/api/v1/doctor/lab-reports", headers=world.headers(doc)).json()["total"] == 0


def test_dashboard(world):
    doc, pat, h, day = setup(world); c = world.client
    empty = c.get(f"{P}/dashboard", headers=h).json()
    assert empty["next_appointment"] is None and empty["stats"]["active_prescriptions"] == 0 and empty["recent_appointments"] == []
    a = c.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day, "time": "10:30"}).json()
    d = c.get(f"{P}/dashboard", headers=h).json()
    assert d["next_appointment"]["id"] == a["id"] and d["patient"]["full_name"] == "Ayesha Khan" and len(d["recent_appointments"]) == 1
    assert set(d["stats"]) == {"active_prescriptions", "active_medicines", "ready_results", "ready_result_names", "awaiting_confirmation", "next_awaiting"}
    assert set(d["hospital"]) == {"name", "address", "phone", "email", "open_hours", "emergency_number"}
    assert c.get(f"{P}/profile", headers=h).json()["email"] == pat.email
