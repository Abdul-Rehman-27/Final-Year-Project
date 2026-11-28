"""P5c: doctor availability (sessions, breaks, exceptions), appointment protection, doctor cancel / reschedule proposals, notifications."""
from datetime import datetime, time, timedelta, timezone

import pytest
from sqlalchemy import create_engine, inspect, text

from app.db.migrations.v008_doctor_availability import upgrade as upgrade_v008
from app.db.session import Base
from app.models.chatbot import AdminAuditLog
from app.models.portal import PortalAppointment
from app.services.portal_core import KARACHI

D, P = "/api/v1/doctor", "/api/v1/patient"


def day_n(n):
    return (datetime.now(KARACHI) + timedelta(days=n)).date()


def utc_at(day, hhmm):
    return datetime.combine(day, time(int(hhmm[:2]), int(hhmm[3:])), tzinfo=KARACHI).astimezone(timezone.utc)


def S(st, en, slot=30, room="R1"):
    return {"start_time": st, "end_time": en, "slot_minutes": slot, "room_label": room}


def body_for(mapping):
    days = []
    for wd in range(7):
        m = mapping.get(wd)
        days.append({"weekday": wd, "is_active": True, "sessions": m["sessions"], "breaks": m.get("breaks", [])} if m else {"weekday": wd, "is_active": False})
    return {"days": days}


def put_all(w, h, sessions, breaks=()):
    r = w.client.put(f"{D}/schedule", headers=h, json=body_for({i: {"sessions": sessions, "breaks": list(breaks)} for i in range(7)}))
    assert r.status_code == 200, r.text
    return r


def slots(w, h, doc, day, **q):
    qs = "".join(f"&{k}={v}" for k, v in q.items())
    r = w.client.get(f"{P}/doctors/{doc.id}/slots?date={day.isoformat()}{qs}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def book(w, h, doc, day, t):
    return w.client.post(f"{P}/appointments", headers=h, json={"doctor_id": doc.id, "date": day.isoformat(), "time": t})


def mk(w, pat, doc, day, t, **kw):
    a = PortalAppointment(patient_id=pat.id, doctor_id=doc.id, starts_at=utc_at(day, t), status=kw.pop("status", "confirmed"),
                          visit_status=kw.pop("visit", "scheduled"), room_label="R1", **kw)
    w.db.add(a); w.db.flush(); a.booking_no = f"APT-{a.id:04d}"; w.db.commit(); return a


def setup(world, sessions=None, breaks=()):
    doc = world.doctor(); pat = world.user("patient")
    dh, ph = world.headers(doc), world.headers(pat)
    put_all(world, dh, sessions or [S("10:00", "13:00")], breaks)
    return doc, pat, dh, ph


# ------------------------------------------------------------------ J / K : sessions and breaks
def test_sessions_have_own_room_and_slot_length(world):
    doc, pat, dh, ph = setup(world, [S("09:00", "10:00", 15, "Room 101"), S("15:00", "16:00", 30, "Room 205")])
    got = world.client.get(f"{D}/schedule", headers=dh).json()["days"][0]
    assert [s["room_label"] for s in got["sessions"]] == ["Room 101", "Room 205"]
    assert (got["start_time"], got["end_time"], got["slot_minutes"], got["room_label"]) == ("09:00", "10:00", 15, "Room 101")   # legacy fields = first session
    r = slots(world, ph, doc, day_n(3))
    assert r["slots"] == ["09:00", "09:15", "09:30", "09:45", "15:00", "15:30"]       # nothing between sessions
    assert {d["time"]: d["room_label"] for d in r["slots_detail"]}["15:30"] == "Room 205"
    a = book(world, ph, doc, day_n(3), "15:30")
    assert a.status_code == 201 and a.json()["room_label"] == "Room 205"
    world.db.expire_all()
    assert world.db.get(PortalAppointment, a.json()["id"]).duration_minutes == 30


def test_breaks_remove_slots_including_partial_overlap(world):
    doc, pat, dh, ph = setup(world, [S("09:00", "13:00", 30)], [{"start_time": "11:00", "end_time": "12:00"}])
    r = slots(world, ph, doc, day_n(3))["slots"]
    assert "10:30" in r and "12:00" in r and "11:00" not in r and "11:30" not in r
    put_all(world, dh, [S("09:00", "12:00", 45)], [{"start_time": "10:00", "end_time": "10:30"}])
    assert slots(world, ph, doc, day_n(3))["slots"] == ["09:00", "10:30", "11:15"]   # 09:45-10:30 overlaps the break
    r = book(world, ph, doc, day_n(3), "09:45")
    assert r.status_code == 409 and r.json()["detail"] == "SLOT_UNAVAILABLE"


@pytest.mark.parametrize("sessions,breaks", [
    ([S("09:00", "10:00")] * 5, []),                                              # > 4 sessions
    ([S("09:00", "11:00"), S("10:30", "12:00")], []),                             # overlap
    ([S("09:00", "10:00")], [{"start_time": "09:30", "end_time": "10:30"}]),      # break leaves the session
    ([S("09:00", "12:00")], [{"start_time": "10:00", "end_time": "11:00"}, {"start_time": "10:30", "end_time": "11:30"}]),
    ([S("09:00", "10:00", 20)], []),                                              # bad slot length
    ([S("09:00", "09:20", 30)], []),                                              # slot longer than session
    ([], []),                                                                     # active day without sessions
    ([S("10:00", "09:00")], []),
])
def test_template_validation(world, sessions, breaks):
    doc, pat, dh, ph = setup(world)
    r = world.client.put(f"{D}/schedule", headers=dh, json=body_for({0: {"sessions": sessions, "breaks": breaks}}))
    assert r.status_code == 422 and r.json()["detail"] == "SCHEDULE_INVALID"


def test_four_sessions_allowed(world):
    doc, pat, dh, ph = setup(world, [S("08:00", "09:00"), S("10:00", "11:00"), S("12:00", "13:00"), S("14:00", "15:00")])
    assert len(world.client.get(f"{D}/schedule", headers=dh).json()["days"][0]["sessions"]) == 4


def test_legacy_contract_still_works(world):
    doc, pat, dh, ph = setup(world)
    legacy = [{"weekday": i, "is_active": i == 1, **({"start_time": "09:00", "end_time": "10:00", "slot_minutes": 30, "room_label": "R9"} if i == 1 else {})} for i in range(7)]
    r = world.client.put(f"{D}/schedule", headers=dh, json={"days": legacy})
    assert r.status_code == 200
    d1 = r.json()["days"][1]
    assert d1["sessions"] == [S("09:00", "10:00", 30, "R9")] and r.json()["days"][0]["is_active"] is False
    bad = [dict(x) for x in legacy]; bad[1]["slot_minutes"] = 20
    assert world.client.put(f"{D}/schedule", headers=dh, json={"days": bad}).json()["detail"] == "SCHEDULE_INVALID"


def test_legacy_put_does_not_wipe_multi_session_day(world):
    doc, pat, dh, ph = setup(world, [S("09:00", "10:00"), S("14:00", "15:00")], [{"start_time": "09:30", "end_time": "10:00"}])
    days = world.client.get(f"{D}/schedule", headers=dh).json()["days"]
    legacy = [{k: d[k] for k in ("weekday", "is_active", "start_time", "end_time", "slot_minutes", "room_label")} for d in days]   # an old client echoing what it read
    assert world.client.put(f"{D}/schedule", headers=dh, json={"days": legacy}).status_code == 200
    kept = world.client.get(f"{D}/schedule", headers=dh).json()["days"][0]
    assert len(kept["sessions"]) == 2 and kept["breaks"] == [{"start_time": "09:30", "end_time": "10:00"}]
    legacy[0]["end_time"] = "11:00"                                              # explicit legacy edit replaces the day with one session
    world.client.put(f"{D}/schedule", headers=dh, json={"days": legacy})
    changed = world.client.get(f"{D}/schedule", headers=dh).json()["days"][0]
    assert changed["sessions"] == [S("09:00", "11:00")] and changed["breaks"] == []


# ------------------------------------------------------------------ M : template edits vs existing appointments
def test_template_change_conflicts_return_409_and_change_nothing(world):
    doc, pat, dh, ph = setup(world)
    a = book(world, ph, doc, day_n(3), "10:00").json()
    before = world.client.get(f"{D}/schedule", headers=dh).json()
    for sessions, breaks in (([S("12:00", "15:00")], []),                                                   # hours moved away
                             ([S("10:00", "13:00")], [{"start_time": "10:00", "end_time": "10:30"}])):      # break over the visit
        r = world.client.put(f"{D}/schedule", headers=dh, json=body_for({i: {"sessions": sessions, "breaks": breaks} for i in range(7)}))
        assert r.status_code == 409 and r.json()["detail"] == "SCHEDULE_CONFLICT"
        assert [x["id"] for x in r.json()["appointments"]] == [a["id"]] and r.json()["appointments"][0]["patient_name"]
    off = {i: {"sessions": [S("10:00", "13:00")]} for i in range(7) if i != day_n(3).weekday()}
    assert world.client.put(f"{D}/schedule", headers=dh, json=body_for(off)).status_code == 409           # that weekday switched off
    assert world.client.get(f"{D}/schedule", headers=dh).json() == before
    world.db.expire_all()
    assert world.db.get(PortalAppointment, a["id"]).status == "confirmed"                                   # never touched


def test_template_change_without_conflict_is_allowed_and_slot_length_change_never_overlaps(world):
    doc, pat, dh, ph = setup(world)
    book(world, ph, doc, day_n(3), "10:00")                                                                # occupies 10:00-10:30
    put_all(world, dh, [S("09:00", "14:00", 15)])                                                          # wider hours + shorter slots: appointment still fits
    r = slots(world, ph, doc, day_n(3))["slots"]
    assert "10:00" not in r and "10:15" not in r and "09:45" in r and "10:30" in r                         # no slot overlaps the booked visit


# ------------------------------------------------------------------ L : exceptions
def test_leave_blocks_slots_and_wins_over_template(world):
    doc, pat, dh, ph = setup(world)
    d = day_n(4)
    r = world.client.put(f"{D}/schedule/exceptions/{d}", headers=dh, json={"kind": "leave", "note": "Conference"})
    assert r.status_code == 200 and r.json()["kind"] == "leave" and r.json()["note"] == "Conference"
    assert slots(world, ph, doc, d)["slots"] == []
    assert book(world, ph, doc, d, "10:00").json()["detail"] == "SLOT_UNAVAILABLE"
    assert slots(world, ph, doc, day_n(5))["slots"]                                                         # other dates unaffected
    assert world.client.get(f"{D}/schedule/day?date={d}", headers=dh).json()["source"] == "leave"


def test_leave_range_and_all_or_nothing(world):
    doc, pat, dh, ph = setup(world)
    r = world.client.post(f"{D}/schedule/exceptions/leave-range", headers=dh, json={"from": day_n(10).isoformat(), "to": day_n(14).isoformat()})
    assert r.status_code == 200 and len(r.json()["items"]) == 5
    assert len(world.client.get(f"{D}/schedule/exceptions", headers=dh).json()["items"]) == 5
    assert slots(world, ph, doc, day_n(12))["slots"] == []
    a = book(world, ph, doc, day_n(20), "10:00").json()
    r = world.client.post(f"{D}/schedule/exceptions/leave-range", headers=dh, json={"from": day_n(19).isoformat(), "to": day_n(21).isoformat()})
    assert r.status_code == 409 and [x["id"] for x in r.json()["appointments"]] == [a["id"]]
    assert len(world.client.get(f"{D}/schedule/exceptions", headers=dh).json()["items"]) == 5               # nothing saved
    bad = world.client.post(f"{D}/schedule/exceptions/leave-range", headers=dh, json={"from": day_n(5).isoformat(), "to": day_n(3).isoformat()})
    assert bad.status_code == 422 and bad.json()["detail"] == "SCHEDULE_INVALID"
    big = world.client.post(f"{D}/schedule/exceptions/leave-range", headers=dh, json={"from": day_n(1).isoformat(), "to": day_n(400).isoformat()})
    assert big.status_code == 422


def test_leave_on_booked_date_refused_with_list(world):
    doc, pat, dh, ph = setup(world)
    a = book(world, ph, doc, day_n(3), "10:30").json()
    r = world.client.put(f"{D}/schedule/exceptions/{day_n(3)}", headers=dh, json={"kind": "leave"})
    assert r.status_code == 409 and r.json()["appointments"][0]["id"] == a["id"]
    assert world.client.get(f"{D}/schedule/exceptions", headers=dh).json()["items"] == []


def test_custom_hours_replace_template(world):
    doc, pat, dh, ph = setup(world)
    d = day_n(3)
    r = world.client.put(f"{D}/schedule/exceptions/{d}", headers=dh, json={"kind": "custom_hours", "sessions": [S("15:00", "16:00", 30, "Room 9")]})
    assert r.status_code == 200
    assert slots(world, ph, doc, d)["slots"] == ["15:00", "15:30"]


def test_extra_session_on_working_and_closed_days(world):
    doc, pat, dh, ph = setup(world)
    d = day_n(3)
    assert world.client.put(f"{D}/schedule/exceptions/{d}", headers=dh, json={"kind": "extra_session", "sessions": [S("16:00", "17:00")]}).status_code == 200
    assert slots(world, ph, doc, d)["slots"] == ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "16:00", "16:30"]      # working day: template + extra
    clash = world.client.put(f"{D}/schedule/exceptions/{day_n(4)}", headers=dh, json={"kind": "extra_session", "sessions": [S("12:30", "14:00")]})
    assert clash.status_code == 422 and clash.json()["detail"] == "SCHEDULE_INVALID"                                          # overlaps template session
    closed = body_for({i: {"sessions": [S("10:00", "13:00")]} for i in range(7) if i != day_n(5).weekday()})
    assert world.client.put(f"{D}/schedule", headers=dh, json=closed).status_code == 200
    assert slots(world, ph, doc, day_n(5))["slots"] == []
    world.client.put(f"{D}/schedule/exceptions/{day_n(5)}", headers=dh, json={"kind": "extra_session", "sessions": [S("09:00", "10:00", 30, "Sunday room")]})
    assert slots(world, ph, doc, day_n(5))["slots"] == ["09:00", "09:30"]                                                      # closed day opened for one date


def test_exception_sessions_cap_and_validation(world):
    doc, pat, dh, ph = setup(world, [S("08:00", "09:00"), S("10:00", "11:00"), S("12:00", "13:00"), S("14:00", "15:00")])
    r = world.client.put(f"{D}/schedule/exceptions/{day_n(3)}", headers=dh, json={"kind": "extra_session", "sessions": [S("16:00", "17:00")]})
    assert r.status_code == 422                                                                                               # 5 sessions in total
    for bad in ({"kind": "nonsense"}, {"kind": "leave", "sessions": [S("09:00", "10:00")]}, {"kind": "custom_hours"},
                {"kind": "custom_hours", "sessions": [S("09:00", "10:00")], "breaks": [{"start_time": "10:00", "end_time": "11:00"}]}):
        assert world.client.put(f"{D}/schedule/exceptions/{day_n(3)}", headers=dh, json=bad).status_code == 422


def test_exception_dates_today_onward_and_beyond_booking_window(world):
    doc, pat, dh, ph = setup(world)
    assert world.client.put(f"{D}/schedule/exceptions/{day_n(-1)}", headers=dh, json={"kind": "leave"}).status_code == 422
    assert world.client.put(f"{D}/schedule/exceptions/not-a-date", headers=dh, json={"kind": "leave"}).status_code == 422
    assert world.client.put(f"{D}/schedule/exceptions/{day_n(0)}", headers=dh, json={"kind": "leave"}).status_code == 200
    far = day_n(90)
    assert world.client.put(f"{D}/schedule/exceptions/{far}", headers=dh, json={"kind": "leave"}).status_code == 200      # planned beyond 30 days
    assert slots(world, ph, doc, far)["slots"] == []                                                                      # patient window stays 30 days


def test_delete_exception_and_guard(world):
    doc, pat, dh, ph = setup(world)
    d = day_n(3)
    world.client.put(f"{D}/schedule/exceptions/{d}", headers=dh, json={"kind": "extra_session", "sessions": [S("16:00", "17:00")]})
    a = book(world, ph, doc, d, "16:00").json()
    r = world.client.delete(f"{D}/schedule/exceptions/{d}", headers=dh)
    assert r.status_code == 409 and r.json()["appointments"][0]["id"] == a["id"]
    world.client.put(f"{D}/schedule/exceptions/{day_n(6)}", headers=dh, json={"kind": "leave"})
    assert world.client.delete(f"{D}/schedule/exceptions/{day_n(6)}", headers=dh).json()["deleted"] is True
    assert slots(world, ph, doc, day_n(6))["slots"]
    assert world.client.delete(f"{D}/schedule/exceptions/{day_n(7)}", headers=dh).status_code == 404


def test_exceptions_are_per_doctor_and_role_protected(world):
    doc, pat, dh, ph = setup(world); other = world.doctor(name="Dr. Other", department="Neurology")
    world.client.put(f"{D}/schedule/exceptions/{day_n(3)}", headers=dh, json={"kind": "leave"})
    assert world.client.get(f"{D}/schedule/exceptions", headers=world.headers(other)).json()["items"] == []
    assert world.client.put(f"{D}/schedule/exceptions/{day_n(3)}", headers=ph, json={"kind": "leave"}).status_code == 403
    assert world.client.get(f"{D}/schedule/exceptions").status_code == 401


def test_calendar_day_view_marks_booked_slots(world):
    doc, pat, dh, ph = setup(world)
    a = book(world, ph, doc, day_n(3), "10:30").json()
    v = world.client.get(f"{D}/schedule/day?date={day_n(3)}", headers=dh).json()
    assert v["source"] == "template" and {s["time"]: s["booked_appointment_id"] for s in v["slots"]}["10:30"] == a["id"]
    assert [x["id"] for x in v["appointments"]] == [a["id"]]


# ------------------------------------------------------------------ O : doctor cancel
def audit(w, action):
    w.db.expire_all()
    return w.db.query(AdminAuditLog).filter_by(action=action).all()


def test_doctor_cancel_requires_reason_notifies_and_audits(world):
    doc, pat, dh, ph = setup(world)
    a = book(world, ph, doc, day_n(3), "10:00").json()
    for bad in ({}, {"reason": ""}, {"reason": "   "}):
        assert world.client.post(f"{D}/appointments/{a['id']}/cancel", headers=dh, json=bad).status_code == 422
    r = world.client.post(f"{D}/appointments/{a['id']}/cancel", headers=dh, json={"reason": "Emergency surgery"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["cancel_reason"] == "Emergency surgery"
    assert "10:00" in slots(world, ph, doc, day_n(3))["slots"]                                              # slot freed
    n = world.client.get(f"{P}/notifications", headers=ph).json()
    assert n["unread_count"] == 1 and n["items"][0]["kind"] == "appointment_cancelled_by_doctor"
    assert "Emergency surgery" in n["items"][0]["message"] and n["items"][0]["data"]["reason"] == "Emergency surgery"
    assert len(audit(world, "doctor_appointment_cancelled")) == 1
    assert world.client.post(f"{D}/appointments/{a['id']}/cancel", headers=dh, json={"reason": "again"}).status_code == 409


def test_doctor_can_only_manage_own_and_only_modifiable(world):
    doc, pat, dh, ph = setup(world); other = world.doctor(name="Dr. Other", department="Neurology")
    a = mk(world, pat, doc, day_n(3), "10:00")
    assert world.client.post(f"{D}/appointments/{a.id}/cancel", headers=world.headers(other), json={"reason": "x"}).status_code == 404
    assert world.client.post(f"{D}/appointments/{a.id}/reschedule-proposals", headers=world.headers(other),
                             json={"date": day_n(4).isoformat(), "time": "10:00"}).status_code == 404
    from datetime import datetime as dt
    checked = mk(world, pat, doc, day_n(5), "10:00"); checked.checked_in_at = dt.now(timezone.utc); world.db.commit()
    done = mk(world, pat, doc, day_n(6), "10:00", status="completed", visit="completed")
    cancelled = mk(world, pat, doc, day_n(7), "10:00", status="cancelled")
    past = PortalAppointment(patient_id=pat.id, doctor_id=doc.id, starts_at=datetime.now(timezone.utc) - timedelta(hours=1), status="confirmed", visit_status="scheduled")
    world.db.add(past); world.db.commit()
    for x in (checked, done, cancelled, past):
        r = world.client.post(f"{D}/appointments/{x.id}/cancel", headers=dh, json={"reason": "x"})
        assert r.status_code == 409 and r.json()["detail"] == "APPOINTMENT_LOCKED"
        r = world.client.post(f"{D}/appointments/{x.id}/reschedule-proposals", headers=dh, json={"date": day_n(9).isoformat(), "time": "10:00"})
        assert r.status_code == 409 and r.json()["detail"] == "APPOINTMENT_LOCKED"


# ------------------------------------------------------------------ N : proposals need patient agreement
def propose(w, dh, a, day, t, note=""):
    return w.client.post(f"{D}/appointments/{a.id if hasattr(a, 'id') else a}/reschedule-proposals", headers=dh, json={"date": day.isoformat(), "time": t, "note": note})


def current_start(w, a):
    w.db.expire_all(); return w.db.get(PortalAppointment, a.id).starts_at


def test_proposal_does_not_move_until_patient_accepts(world):
    doc, pat, dh, ph = setup(world)
    a = mk(world, pat, doc, day_n(3), "10:00"); orig = current_start(world, a)
    r = propose(world, dh, a, day_n(5), "11:00", "Meeting")
    assert r.status_code == 201 and r.json()["status"] == "pending" and r.json()["room_label"] == "R1"
    assert current_start(world, a) == orig                                                                  # unchanged
    n = world.client.get(f"{P}/notifications", headers=ph).json()["items"][0]
    assert n["kind"] == "reschedule_proposed" and n["data"]["proposal_id"] == r.json()["id"]
    pid = r.json()["id"]
    acc = world.client.post(f"{P}/reschedule-proposals/{pid}/accept", headers=ph)
    assert acc.status_code == 200 and acc.json()["proposal"]["status"] == "accepted"
    world.db.expire_all(); moved = world.db.get(PortalAppointment, a.id)
    assert moved.starts_at.replace(tzinfo=timezone.utc) == utc_at(day_n(5), "11:00") and moved.status == "confirmed" and moved.token_no
    assert moved.duration_minutes == 30
    assert len(audit(world, "doctor_reschedule_proposed")) == 1 and len(audit(world, "reschedule_proposal_accepted")) == 1
    assert world.client.post(f"{P}/reschedule-proposals/{pid}/accept", headers=ph).status_code == 409      # no double accept


def test_declined_proposal_leaves_appointment_unresolved(world):
    doc, pat, dh, ph = setup(world)
    a = mk(world, pat, doc, day_n(3), "10:00"); orig = current_start(world, a)
    pid = propose(world, dh, a, day_n(5), "11:00").json()["id"]
    d = world.client.post(f"{P}/reschedule-proposals/{pid}/decline", headers=ph, json={"note": "Cannot make it"})
    assert d.status_code == 200 and d.json()["status"] == "declined" and d.json()["response_note"] == "Cannot make it"
    assert current_start(world, a) == orig
    assert world.client.get(f"{D}/reschedule-proposals?status=declined", headers=dh).json()["items"][0]["id"] == pid
    assert world.client.post(f"{P}/reschedule-proposals/{pid}/accept", headers=ph).status_code == 409
    assert len(audit(world, "reschedule_proposal_declined")) == 1
    assert world.client.post(f"{D}/appointments/{a.id}/cancel", headers=dh, json={"reason": "Unavailable"}).status_code == 200   # doctor can still cancel


def test_proposal_validation_slot_taken_overlap_window(world):
    doc, pat, dh, ph = setup(world); other = world.user("patient"); doc2 = world.doctor(name="Dr. Two", department="Neurology")
    a = mk(world, pat, doc, day_n(3), "10:00")
    mk(world, other, doc, day_n(6), "10:00")
    mk(world, pat, doc2, day_n(6), "11:00")                                                                 # patient's other visit
    assert propose(world, dh, a, day_n(6), "10:00").json()["detail"] == "SLOT_UNAVAILABLE"                  # taken by someone else
    assert propose(world, dh, a, day_n(6), "10:15").json()["detail"] == "SLOT_UNAVAILABLE"                  # not a slot
    assert propose(world, dh, a, day_n(3), "10:00").json()["detail"] == "SLOT_UNAVAILABLE"                  # same time
    r = propose(world, dh, a, day_n(6), "11:00")
    assert r.status_code == 409 and r.json()["detail"] == "PATIENT_OVERLAP"                                 # no-overlap rule always applies
    assert propose(world, dh, a, day_n(31), "10:00").json()["detail"] == "TOO_FAR_AHEAD"                    # patient window stays 30 days
    assert propose(world, dh, a, day_n(-1), "10:00").json()["detail"] == "SLOT_IN_PAST"
    put_all(world, dh, [S("10:00", "13:00")]); world.client.put(f"{D}/schedule/exceptions/{day_n(8)}", headers=dh, json={"kind": "leave"})
    assert propose(world, dh, a, day_n(8), "10:00").json()["detail"] == "SLOT_UNAVAILABLE"                  # leave / break / exception respected


def test_max_three_limit_does_not_block_accepting_a_move(world):
    doc, pat, dh, ph = setup(world)
    a = mk(world, pat, doc, day_n(2), "10:00"); mk(world, pat, doc, day_n(3), "10:00"); mk(world, pat, doc, day_n(4), "10:00")
    assert book(world, ph, doc, day_n(7), "10:00").json()["detail"] == "BOOKING_LIMIT_REACHED"             # a NEW booking is blocked...
    pid = propose(world, dh, a, day_n(7), "10:30").json()["id"]
    assert world.client.post(f"{P}/reschedule-proposals/{pid}/accept", headers=ph).status_code == 200     # ...a move is not


def test_accept_revalidates_and_changes_nothing_on_failure(world):
    doc, pat, dh, ph = setup(world); other = world.user("patient")
    a = mk(world, pat, doc, day_n(3), "10:00"); orig = current_start(world, a)
    pid = propose(world, dh, a, day_n(5), "11:00").json()["id"]
    mk(world, other, doc, day_n(5), "11:00")                                                                # slot taken after the proposal
    r = world.client.post(f"{P}/reschedule-proposals/{pid}/accept", headers=ph)
    assert r.status_code == 409 and r.json()["detail"] == "SLOT_UNAVAILABLE"
    assert current_start(world, a) == orig
    pid2 = propose(world, dh, a, day_n(5), "12:00").json()["id"]
    mk(world, pat, doc, day_n(5), "12:00")                                                                  # patient now busy at that time (same doctor, same time -> also unique slot)
    assert world.client.post(f"{P}/reschedule-proposals/{pid2}/accept", headers=ph).status_code == 409
    assert current_start(world, a) == orig


def test_supersede_withdraw_and_patient_cancel_close_pending(world):
    doc, pat, dh, ph = setup(world)
    a = mk(world, pat, doc, day_n(3), "10:00")
    p1 = propose(world, dh, a, day_n(5), "10:00").json()["id"]; p2 = propose(world, dh, a, day_n(5), "10:30").json()["id"]
    items = {x["id"]: x["status"] for x in world.client.get(f"{D}/reschedule-proposals?appointment_id={a.id}", headers=dh).json()["items"]}
    assert items == {p1: "superseded", p2: "pending"}
    assert world.client.post(f"{P}/reschedule-proposals/{p1}/accept", headers=ph).status_code == 409
    w = world.client.post(f"{D}/reschedule-proposals/{p2}/withdraw", headers=dh)
    assert w.status_code == 200 and w.json()["status"] == "withdrawn"
    assert world.client.post(f"{D}/reschedule-proposals/{p2}/withdraw", headers=dh).status_code == 409
    kinds = [n["kind"] for n in world.client.get(f"{P}/notifications", headers=ph).json()["items"]]
    assert "reschedule_proposal_withdrawn" in kinds and len(audit(world, "doctor_reschedule_withdrawn")) == 1
    p3 = propose(world, dh, a, day_n(5), "11:00").json()["id"]
    a_far = mk(world, pat, doc, day_n(10), "10:00")
    p4 = propose(world, dh, a_far, day_n(11), "10:00").json()["id"]
    assert world.client.post(f"{P}/appointments/{a_far.id}/cancel", headers=ph).status_code == 200            # patient cancels -> its proposal closes
    st = {x["id"]: x["status"] for x in world.client.get(f"{D}/reschedule-proposals", headers=dh).json()["items"]}
    assert st[p4] == "withdrawn" and st[p3] == "pending"


def test_proposals_are_scoped_to_the_two_parties(world):
    doc, pat, dh, ph = setup(world); other_pat = world.user("patient"); other_doc = world.doctor(name="Dr. Other", department="Neurology")
    a = mk(world, pat, doc, day_n(3), "10:00"); pid = propose(world, dh, a, day_n(5), "11:00").json()["id"]
    oh = world.headers(other_pat)
    assert world.client.post(f"{P}/reschedule-proposals/{pid}/accept", headers=oh).status_code == 404
    assert world.client.post(f"{P}/reschedule-proposals/{pid}/decline", headers=oh).status_code == 404
    assert world.client.get(f"{P}/reschedule-proposals", headers=oh).json()["items"] == []
    assert world.client.post(f"{D}/reschedule-proposals/{pid}/withdraw", headers=world.headers(other_doc)).status_code == 404
    assert world.client.get(f"{D}/reschedule-proposals", headers=world.headers(other_doc)).json()["items"] == []
    assert world.client.get(f"{P}/reschedule-proposals", headers=ph).json()["items"][0]["id"] == pid
    assert world.client.post(f"{P}/reschedule-proposals/{pid}/accept", headers=dh).status_code == 403


# ------------------------------------------------------------------ notifications
def test_notifications_list_read_and_scope(world):
    doc, pat, dh, ph = setup(world); other = world.user("patient")
    for t in ("10:00", "10:30"):
        a = mk(world, pat, doc, day_n(3), t); world.client.post(f"{D}/appointments/{a.id}/cancel", headers=dh, json={"reason": "r"})
    n = world.client.get(f"{P}/notifications", headers=ph).json()
    assert n["unread_count"] == 2 and len(n["items"]) == 2 and n["items"][0]["id"] > n["items"][1]["id"]
    assert world.client.get(f"{P}/notifications", headers=world.headers(other)).json() == {"unread_count": 0, "items": []}
    nid = n["items"][0]["id"]
    assert world.client.post(f"{P}/notifications/{nid}/read", headers=world.headers(other)).status_code == 404
    assert world.client.post(f"{P}/notifications/{nid}/read", headers=ph).json()["read_at"]
    assert world.client.get(f"{P}/notifications?unread_only=true", headers=ph).json()["unread_count"] == 1
    assert world.client.post(f"{P}/notifications/read-all", headers=ph).json()["unread_count"] == 0
    assert world.client.get(f"{P}/notifications", headers=dh).status_code == 403


# ------------------------------------------------------------------ migration
def test_migration_v008_adds_columns_to_old_schema_and_is_idempotent(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path}/old.db")
    Base.metadata.create_all(eng)
    with eng.begin() as c:
        for t, col in (("portal_doctor_schedules", "sessions_json"), ("portal_doctor_schedules", "breaks_json"), ("portal_appointments", "duration_minutes"),
                       ("portal_appointments", "cancel_reason"), ("portal_appointments", "cancelled_by_role"), ("portal_appointments", "cancelled_by_id"),
                       ("portal_appointments", "cancelled_at")):
            c.execute(text(f"ALTER TABLE {t} DROP COLUMN {col}"))
    upgrade_v008(eng); upgrade_v008(eng)
    insp = inspect(eng)
    assert {"sessions_json", "breaks_json"} <= {c["name"] for c in insp.get_columns("portal_doctor_schedules")}
    assert {"duration_minutes", "cancel_reason", "cancelled_by_role", "cancelled_by_id", "cancelled_at"} <= {c["name"] for c in insp.get_columns("portal_appointments")}


def test_admin_audit_log_screen_lists_doctor_and_patient_actions(world):
    doc, pat, dh, ph = setup(world); admin = world.user("admin")
    a = mk(world, pat, doc, day_n(3), "10:00"); b = mk(world, pat, doc, day_n(4), "10:00")
    world.client.post(f"{D}/appointments/{a.id}/cancel", headers=dh, json={"reason": "Emergency"})
    pid = propose(world, dh, b, day_n(6), "11:00").json()["id"]
    world.client.post(f"{P}/reschedule-proposals/{pid}/accept", headers=ph)
    r = world.client.get("/api/v1/admin/audit-logs?page_size=50", headers=world.headers(admin))
    assert r.status_code == 200, r.text
    actions = {x["action"] for x in r.json()["items"]}
    assert {"doctor_appointment_cancelled", "doctor_reschedule_proposed", "reschedule_proposal_accepted"} <= actions
