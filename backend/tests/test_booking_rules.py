"""P5a: patient booking rules (30-day window, max 3 upcoming, no overlaps, 2h edit/cancel cutoff, atomic reschedule)."""
from datetime import datetime, timedelta, timezone

from app.models.portal import PortalAppointment, PortalDoctorSchedule
from app.services.portal_core import KARACHI

P = "/api/v1/patient"


def day_n(n):
    return (datetime.now(KARACHI) + timedelta(days=n)).date()


def sched(w, doc, day, start="10:00", end="13:00", slot=30):
    w.db.add(PortalDoctorSchedule(doctor_id=doc.id, weekday=day.weekday(), is_active=True, start_time=start, end_time=end,
                                  slot_minutes=slot, room_label="Room 1"))
    w.db.commit()


def week_schedule(w, doc, **kw):
    for n in range(1, 8):          # every weekday so any date in the window is bookable
        sched(w, doc, day_n(n), **kw)


def book(w, h, doc, day, time):
    return w.client.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day.isoformat(), "time": time})


def test_booking_window_30_days(world):
    doc = world.doctor(); pat = world.user("patient"); h = world.headers(pat); week_schedule(world, doc)
    assert book(world, h, doc, day_n(30), "10:00").status_code == 201
    r = book(world, h, doc, day_n(31), "10:00")
    assert r.status_code == 422 and r.json()["detail"] == "TOO_FAR_AHEAD"
    far = world.client.get(f"{P}/doctors/{doc.id}/slots?date={day_n(31).isoformat()}", headers=h).json()
    assert far["slots"] == []                                  # nothing offered beyond the window
    assert world.client.get(f"{P}/doctors/{doc.id}/slots?date={day_n(30).isoformat()}", headers=h).json()["slots"]


def test_max_three_upcoming_active(world):
    doc = world.doctor(); pat = world.user("patient"); h = world.headers(pat); week_schedule(world, doc)
    ids = [book(world, h, doc, day_n(n), "10:00").json()["id"] for n in (1, 2, 3)]
    r = book(world, h, doc, day_n(4), "10:00")
    assert r.status_code == 409 and r.json()["detail"] == "BOOKING_LIMIT_REACHED"
    # completed / cancelled / past ones do not count; cancelling frees a place
    assert world.client.post(f"{P}/appointments/{ids[0]}/cancel", headers=h).status_code == 200
    assert book(world, h, doc, day_n(4), "10:00").status_code == 201
    world.appt(pat, doc, days=-3, status="completed", visit="completed")
    world.appt(pat, doc, days=-4, status="cancelled", token=False)
    assert book(world, h, doc, day_n(5), "10:00").json()["detail"] == "BOOKING_LIMIT_REACHED"
    # other patients are unaffected
    other = world.headers(world.user("patient"))
    assert book(world, other, doc, day_n(5), "10:00").status_code == 201


def test_same_doctor_same_day_allowed_when_not_overlapping(world):
    doc = world.doctor(); pat = world.user("patient"); h = world.headers(pat); week_schedule(world, doc)
    d = day_n(2)
    assert book(world, h, doc, d, "10:00").status_code == 201
    assert book(world, h, doc, d, "10:30").status_code == 201      # back-to-back, not overlapping
    assert book(world, h, doc, d, "12:00").status_code == 201


def test_overlap_across_different_doctors(world):
    d1 = world.doctor(); d2 = world.doctor("Dr. Two", "Dermatology", "Derm")
    pat = world.user("patient"); h = world.headers(pat); d = day_n(2)
    sched(world, d1, d, "10:00", "12:00", 30)
    sched(world, d2, d, "10:15", "12:15", 30)                      # offset grid -> partial overlap possible
    assert book(world, h, d1, d, "10:00").status_code == 201       # 10:00-10:30
    r = book(world, h, d2, d, "10:15")                             # 10:15-10:45 overlaps
    assert r.status_code == 409 and r.json()["detail"] == "PATIENT_OVERLAP"
    assert book(world, h, d2, d, "10:45").status_code == 201       # 10:45-11:15 is fine
    slots = world.client.get(f"{P}/doctors/{d2.id}/slots?date={d.isoformat()}", headers=h).json()["slots"]
    assert "10:15" not in slots and "10:45" not in slots and "11:15" in slots   # own clashes hidden from the picker
    # another patient still sees 10:15 as free
    o = world.headers(world.user("patient"))
    assert "10:15" in world.client.get(f"{P}/doctors/{d2.id}/slots?date={d.isoformat()}", headers=o).json()["slots"]


def test_edit_and_cancel_allowed_at_any_time_before_checkin(world):
    doc = world.doctor(); pat = world.user("patient"); h = world.headers(pat)
    near = world.appt(pat, doc, minutes=30)                        # 30 min away -> still editable (no cutoff)
    far = world.appt(pat, doc, minutes=180)
    items = {x["id"]: x for x in world.client.get(f"{P}/appointments", headers=h).json()["items"]}
    assert items[near.id]["can_edit"] is True and items[near.id]["can_cancel"] is True
    assert items[far.id]["can_edit"] is True and items[far.id]["can_cancel"] is True
    assert world.client.post(f"{P}/appointments/{near.id}/cancel", headers=h).json()["status"] == "cancelled"
    assert world.client.post(f"{P}/appointments/{far.id}/cancel", headers=h).json()["status"] == "cancelled"


def test_reschedule_failure_leaves_original_unchanged(world):
    doc = world.doctor(); pat = world.user("patient"); h = world.headers(pat); week_schedule(world, doc)
    other = world.headers(world.user("patient"))
    a = book(world, h, doc, day_n(2), "10:00").json()
    book(world, other, doc, day_n(3), "10:30")                     # slot someone else holds
    book(world, h, doc, day_n(4), "11:00")                         # patient's own other booking
    def snap():
        world.db.expire_all(); r = world.db.get(PortalAppointment, a["id"])
        return (r.doctor_id, r.starts_at, r.token_no, r.room_label, r.status)
    before = snap()
    d3, d4, d31 = day_n(3).isoformat(), day_n(4).isoformat(), day_n(31).isoformat()
    cases = [({"date": d3, "time": "10:30"}, 409, "SLOT_UNAVAILABLE"),
             ({"date": d4, "time": "11:00"}, 409, "SLOT_UNAVAILABLE"),   # own other booking occupies that doctor slot
             ({"date": d31, "time": "10:00"}, 422, "TOO_FAR_AHEAD"),
             ({"date": "2020-01-01", "time": "10:00"}, 422, "SLOT_IN_PAST"),
             ({"date": d3, "time": "xx"}, 422, "VALIDATION_ERROR"),
             ({"date": d3, "time": "10:00", "doctor_id": 9999}, 404, "NOT_FOUND")]
    for body, status, code in cases:
        r = world.client.patch(f"{P}/appointments/{a['id']}", headers=h, json=body)
        assert (r.status_code, r.json()["detail"]) == (status, code), body
        assert snap() == before
    ok = world.client.patch(f"{P}/appointments/{a['id']}", headers=h, json={"date": d3, "time": "10:00"})
    assert ok.status_code == 200 and ok.json()["starts_at"] != a["starts_at"] and snap() != before


def test_reschedule_overlap_with_own_other_booking_and_self_move(world):
    d1 = world.doctor(); d2 = world.doctor("Dr. Two", "Dermatology", "Derm")
    pat = world.user("patient"); h = world.headers(pat); d = day_n(2)
    sched(world, d1, d, "10:00", "12:00", 30); sched(world, d2, d, "10:15", "12:15", 30)
    a = book(world, h, d1, d, "10:00").json()
    b = book(world, h, d2, d, "10:45").json()
    r = world.client.patch(f"{P}/appointments/{b['id']}", headers=h, json={"date": d.isoformat(), "time": "10:15"})
    assert r.status_code == 409 and r.json()["detail"] == "PATIENT_OVERLAP"
    # 10:30-11:00 would clash with b (10:45-11:15) ...
    assert world.client.patch(f"{P}/appointments/{a['id']}", headers=h, json={"date": d.isoformat(), "time": "10:30"}).json()["detail"] == "PATIENT_OVERLAP"
    # ... while a free time works, and the appointment never conflicts with its own old time
    ok = world.client.patch(f"{P}/appointments/{a['id']}", headers=h, json={"date": d.isoformat(), "time": "11:30"})
    assert ok.status_code == 200
    # switching doctor via reschedule re-validates and issues a fresh token for the new doctor
    ok2 = world.client.patch(f"{P}/appointments/{a['id']}", headers=h, json={"doctor_id": d2.id, "date": d.isoformat(), "time": "11:15"})
    assert ok2.status_code == 200 and ok2.json()["doctor_id"] == d2.id and ok2.json()["token_no"].startswith("D-")


def test_slots_exclude_param_only_for_own_appointment(world):
    doc = world.doctor(); pat = world.user("patient"); h = world.headers(pat); week_schedule(world, doc); d = day_n(2)
    mine = book(world, h, doc, d, "10:00").json()
    stranger = world.headers(world.user("patient"))
    url = lambda i: f"{P}/doctors/{doc.id}/slots?date={d.isoformat()}&exclude_appointment_id={i}"
    assert "10:00" in world.client.get(url(mine["id"]), headers=h).json()["slots"]          # own slot offered while editing
    assert "10:00" not in world.client.get(url(mine["id"]), headers=stranger).json()["slots"]  # cannot peek via someone else's id
