"""P5b: admin Hospital Profile (GET/PUT, audit, shared with patient/doctor portals) + patient lab-booking rules."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.chatbot import AdminAuditLog
from app.models.portal import PortalHospitalSettings, PortalLabReport
from app.services.portal_core import KARACHI

A = "/api/v1/admin/hospital-profile"
P = "/api/v1/patient"


def day_n(n):
    return (datetime.now(KARACHI) + timedelta(days=n)).date().isoformat()


def body(**o):
    b = {"name": "CityHospital", "address": "12 Mall Road, Karachi", "phone": "021-111-222", "email": "Info@CityHospital.pk",
         "emergencyNumber": "1122", "open24Hours": True}
    b.update(o)
    return b


@pytest.fixture()
def admin(world):
    return world.user("admin")


@pytest.fixture()
def ah(world, admin):
    return world.headers(admin)


def audits(world):
    world.db.expire_all()
    return world.db.scalars(select(AdminAuditLog).where(AdminAuditLog.action == "hospital_profile_updated")).all()


def test_admin_only(world):
    assert world.client.get(A).status_code == 401
    for u in (world.user("patient"), world.doctor()):
        assert world.client.get(A, headers=world.headers(u)).status_code == 403
        assert world.client.put(A, json=body(), headers=world.headers(u)).status_code == 403


def test_get_defaults(world, ah):
    d = world.client.get(A, headers=ah).json()
    assert d["name"] == "CityHospital" and d["open24Hours"] is True and d["openHours"] == "Open 24 hours"
    assert d["emergencyNumber"] == "" and d["opensAt"] is None and d["labOpensAt"] is None


def test_put_updates_everywhere_and_audits(world, ah):
    r = world.client.put(A, json=body(open24Hours=False, opensAt="08:00", closesAt="20:00"), headers=ah)
    assert r.status_code == 200
    d = r.json()
    assert d["email"] == "info@cityhospital.pk" and d["openHours"] == "08:00 \u2013 20:00" and d["opensAt"] == "08:00"
    assert world.client.get(A, headers=ah).json() == d
    ph = world.client.get(f"{P}/hospital", headers=world.headers(world.user("patient"))).json()
    assert ph == {"name": "CityHospital", "address": "12 Mall Road, Karachi", "phone": "021-111-222", "email": "info@cityhospital.pk",
                  "open_hours": "08:00 \u2013 20:00", "emergency_number": "1122"}
    doc = world.client.get("/api/v1/doctor/hospital-info", headers=world.headers(world.doctor())).json()
    assert doc["open_hours"] == "08:00 \u2013 20:00" and doc["phone"] == "021-111-222"
    a = audits(world)
    assert len(a) == 1 and a[0].target == "hospital:1" and a[0].old_value["open24Hours"] is True and a[0].new_value["opensAt"] == "08:00"
    # identical save -> no new audit row; switching back to 24h clears the stored times
    world.client.put(A, json=body(open24Hours=False, opensAt="08:00", closesAt="20:00"), headers=ah)
    assert len(audits(world)) == 1
    d = world.client.put(A, json=body(opensAt="09:00", closesAt="10:00"), headers=ah).json()
    assert d["open24Hours"] is True and d["opensAt"] is None and d["openHours"] == "Open 24 hours" and len(audits(world)) == 2


@pytest.mark.parametrize("override", [
    {"name": "A"}, {"name": "x" * 101}, {"phone": "abc"}, {"emergencyNumber": "12$"}, {"email": "not-an-email"},
    {"address": "x" * 256}, {"open24Hours": False}, {"open24Hours": False, "opensAt": "08:00"},
    {"open24Hours": False, "opensAt": "20:00", "closesAt": "08:00"}, {"open24Hours": False, "opensAt": "08:00", "closesAt": "08:00"},
    {"open24Hours": False, "opensAt": "8:00", "closesAt": "20:00"}, {"open24Hours": False, "opensAt": "08:00", "closesAt": "24:00"},
    {"labOpensAt": "08:00"}, {"labOpensAt": "10:00", "labClosesAt": "09:00"}, {"labOpensAt": "xx", "labClosesAt": "10:00"},
])
def test_put_validation(world, ah, override):
    assert world.client.put(A, json=body(**override), headers=ah).status_code == 422
    assert world.client.get(A, headers=ah).json()["name"] == "CityHospital" and not audits(world)


def test_empty_optional_fields_allowed(world, ah):
    d = world.client.put(A, json={"name": "CityHospital"}, headers=ah).json()
    assert d["address"] == d["phone"] == d["email"] == d["emergencyNumber"] == ""


# ------------------------------------------------------------------ lab booking rules
def cbc(world, h):
    return next(t for t in world.client.get(f"{P}/lab-tests", headers=h).json() if t["name"] == "Complete blood count")["id"]


def lab(world, h, test_id, day, time, **kw):
    return world.client.post(f"{P}/lab-reports", headers=h, json={"test_id": test_id, "date": day, "time": time, **kw})


def test_lab_window_30_days(world):
    h = world.headers(world.user("patient")); t = cbc(world, h)
    assert lab(world, h, t, day_n(30), "09:00").status_code == 201
    r = lab(world, h, world.client.get(f"{P}/lab-tests", headers=h).json()[1]["id"], day_n(31), "09:00")
    assert r.status_code == 422 and r.json()["detail"] == "TOO_FAR_AHEAD"


def test_lab_hours_from_hospital_profile(world, ah):
    world.client.put(A, json=body(open24Hours=False, opensAt="08:00", closesAt="20:00"), headers=ah)
    h = world.headers(world.user("patient")); tests = world.client.get(f"{P}/lab-tests", headers=h).json()
    ids = [t["id"] for t in tests]
    for i, (time, ok) in enumerate([("07:59", False), ("08:00", True), ("19:59", True), ("20:00", False), ("23:30", False)]):
        r = lab(world, h, ids[i], day_n(2), time)
        assert (r.status_code == 201) == ok, time
        if not ok:
            assert r.json()["detail"] == "OUTSIDE_HOURS"


def test_lab_hours_override_and_24h(world, ah):
    h = world.headers(world.user("patient")); ids = [t["id"] for t in world.client.get(f"{P}/lab-tests", headers=h).json()]
    assert lab(world, h, ids[0], day_n(2), "03:00").status_code == 201                       # 24h hospital: any time
    world.client.put(A, json=body(open24Hours=False, opensAt="08:00", closesAt="20:00", labOpensAt="09:00", labClosesAt="12:00"), headers=ah)
    assert lab(world, h, ids[1], day_n(2), "08:30").json()["detail"] == "OUTSIDE_HOURS"       # lab hours win over hospital hours
    assert lab(world, h, ids[1], day_n(2), "11:30").status_code == 201
    world.client.put(A, json=body(labOpensAt="09:00", labClosesAt="12:00"), headers=ah)       # 24h hospital but lab limited
    assert lab(world, h, ids[2], day_n(2), "13:00").json()["detail"] == "OUTSIDE_HOURS"
    world.client.put(A, json=body(), headers=ah)                                               # override removed -> follows hospital
    assert lab(world, h, ids[2], day_n(2), "13:00").status_code == 201


def test_lab_duplicate_active_request(world):
    pat = world.user("patient"); h = world.headers(pat); doc = world.doctor(); t = cbc(world, h)
    first = lab(world, h, t, day_n(2), "09:00")
    assert first.status_code == 201
    r = lab(world, h, t, day_n(3), "10:00")
    assert r.status_code == 409 and r.json()["detail"] == "DUPLICATE_ACTIVE_REQUEST"
    other_test = next(x["id"] for x in world.client.get(f"{P}/lab-tests", headers=h).json() if x["id"] != t)
    assert lab(world, h, other_test, day_n(3), "10:00").status_code == 201                    # different test is fine
    assert lab(world, world.headers(world.user("patient")), t, day_n(2), "09:00").status_code == 201   # other patient is fine
    for status in ("in_progress", "requested", "scheduled"):                                  # every active status blocks
        row = world.db.get(PortalLabReport, first.json()["id"]); row.status = status; world.db.commit()
        assert lab(world, h, t, day_n(3), "10:00").json()["detail"] == "DUPLICATE_ACTIVE_REQUEST", status
    for status in ("ready", "cancelled"):                                                      # finished/cancelled free the test
        row = world.db.get(PortalLabReport, first.json()["id"]); row.status = status; world.db.commit()
        assert lab(world, h, t, day_n(3), "10:00").status_code == 201, status
        world.db.query(PortalLabReport).filter(PortalLabReport.id != first.json()["id"], PortalLabReport.test_id == t,
                                               PortalLabReport.patient_id == pat.id).delete(); world.db.commit()


def test_lab_duplicate_includes_doctor_requested(world):
    pat = world.user("patient"); h = world.headers(pat); doc = world.doctor(); t = cbc(world, h)
    world.db.add(PortalLabReport(report_no="LAB-77", test_id=t, test_name="Complete blood count", kind="lab", patient_id=pat.id,
                                 requested_by_doctor_id=doc.id, status="requested")); world.db.commit()
    assert lab(world, h, t, day_n(2), "09:00").json()["detail"] == "DUPLICATE_ACTIVE_REQUEST"
