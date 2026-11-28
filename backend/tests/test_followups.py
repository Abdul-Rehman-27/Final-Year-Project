"""P5d: follow-up recommendations, doctor-direct follow-ups (with consent), patient self-booked follow-ups, doctor notifications."""
from datetime import timedelta

from sqlalchemy import create_engine, inspect, text

from app.db.migrations.v009_followups import upgrade as upgrade_v009
from app.db.session import Base
from app.models.chatbot import AdminAuditLog
from app.models.portal import PortalAppointment, PortalFollowupRecommendation
from tests.test_availability import D, P, S, day_n, mk, put_all, utc_at


def setup(world):
    doc = world.doctor(); pat = world.user("patient")
    dh, ph = world.headers(doc), world.headers(pat)
    put_all(world, dh, [S("10:00", "13:00")])
    src = mk(world, pat, doc, day_n(-3), "10:00", status="completed", visit="completed")     # the earlier visit
    return doc, pat, dh, ph, src


def rec(w, dh, src, day, t, **kw):
    return w.client.post(f"{D}/appointments/{src.id}/followup-recommendations", headers=dh, json={"date": day.isoformat(), "time": t, **kw})


def accept(w, ph, rid, day=None, t=None):
    body = {"date": day.isoformat(), "time": t} if day else None
    return w.client.post(f"{P}/followup-recommendations/{rid}/accept", headers=ph, json=body) if body else w.client.post(f"{P}/followup-recommendations/{rid}/accept", headers=ph)


def audit(w, action):
    w.db.expire_all()
    return w.db.query(AdminAuditLog).filter_by(action=action).all()


def kinds(w, h, who):
    return [n["kind"] for n in w.client.get(f"/api/v1/{who}/notifications", headers=h).json()["items"]]


# ------------------------------------------------------------------ recommend
def test_recommendation_is_not_an_appointment_and_notifies_patient(world):
    doc, pat, dh, ph, src = setup(world)
    r = rec(world, dh, src, day_n(7), "11:00", note="Bring your reports")
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["status"] == "pending" and j["note"] == "Bring your reports" and j["source_appointment_id"] == src.id and j["appointment_id"] is None
    world.db.expire_all()
    assert world.db.query(PortalAppointment).count() == 1                                   # only the old visit: nothing was booked
    assert kinds(world, ph, "patient") == ["followup_recommended"]
    assert world.client.get(f"{P}/followup-recommendations", headers=ph).json()["items"][0]["id"] == j["id"]
    assert world.client.get(f"{D}/followup-recommendations?status=pending&appointment_id={src.id}", headers=dh).json()["items"][0]["id"] == j["id"]
    assert len(audit(world, "doctor_followup_recommended")) == 1
    # the slot is still free for everybody (no hold)
    assert "11:00" in world.client.get(f"{P}/doctors/{doc.id}/slots?date={day_n(7)}", headers=world.headers(world.user("patient"))).json()["slots"]


def test_recommendation_validation(world):
    doc, pat, dh, ph, src = setup(world)
    other_doc = world.doctor(name="Dr. Other"); oh = world.headers(other_doc)
    assert rec(world, oh, src, day_n(7), "11:00").status_code == 404                          # someone else's visit
    assert rec(world, dh, src, day_n(-1), "11:00").status_code == 422                        # past (SLOT_IN_PAST) -> 422
    assert rec(world, dh, src, day_n(31), "11:00").json()["detail"] == "TOO_FAR_AHEAD"
    assert rec(world, dh, src, day_n(7), "11:00", note="x" * 301).status_code == 422
    assert rec(world, dh, src, day_n(7), "09:00").json()["detail"] == "SLOT_UNAVAILABLE"      # outside the sessions
    mk(world, world.user("patient"), doc, day_n(7), "11:00")
    assert rec(world, dh, src, day_n(7), "11:00").json()["detail"] == "SLOT_UNAVAILABLE"      # taken
    cancelled = mk(world, pat, doc, day_n(-2), "10:00", status="cancelled")
    assert rec(world, dh, cancelled, day_n(7), "12:00").json()["detail"] == "VALIDATION_ERROR"   # cancelled visit cannot be linked
    later = mk(world, pat, doc, day_n(9), "10:00")
    assert rec(world, dh, later, day_n(7), "12:00").json()["detail"] == "VALIDATION_ERROR"       # follow-up must come AFTER the linked visit
    assert world.client.post(f"{D}/appointments/{src.id}/followup-recommendations", headers=ph, json={"date": day_n(7).isoformat(), "time": "11:00"}).status_code == 403


def test_one_pending_per_visit_supersede_withdraw_and_replace(world):
    doc, pat, dh, ph, src = setup(world)
    first = rec(world, dh, src, day_n(7), "11:00").json()
    second = rec(world, dh, src, day_n(8), "11:00").json()
    st = {x["id"]: x["status"] for x in world.client.get(f"{D}/followup-recommendations", headers=dh).json()["items"]}
    assert st == {first["id"]: "superseded", second["id"]: "pending"}
    assert accept(world, ph, first["id"]).json()["detail"] == "INVALID_TRANSITION"
    w = world.client.post(f"{D}/followup-recommendations/{second['id']}/withdraw", headers=dh)
    assert w.status_code == 200 and w.json()["status"] == "withdrawn"
    assert world.client.post(f"{D}/followup-recommendations/{second['id']}/withdraw", headers=dh).json()["detail"] == "INVALID_TRANSITION"
    assert "followup_recommendation_withdrawn" in kinds(world, ph, "patient")
    assert accept(world, ph, second["id"]).json()["detail"] == "INVALID_TRANSITION"
    third = rec(world, dh, src, day_n(9), "11:00")                                            # replacement after withdrawal
    assert third.status_code == 201 and third.json()["status"] == "pending"
    other = world.headers(world.doctor(name="Dr. Z"))
    assert world.client.post(f"{D}/followup-recommendations/{third.json()['id']}/withdraw", headers=other).status_code == 404
    assert len(audit(world, "doctor_followup_withdrawn")) == 1


# ------------------------------------------------------------------ accept / choose another / decline
def test_accept_exact_slot_creates_linked_confirmed_appointment_and_notifies_doctor(world):
    doc, pat, dh, ph, src = setup(world)
    rid = rec(world, dh, src, day_n(7), "11:00").json()["id"]
    r = accept(world, ph, rid)
    assert r.status_code == 200, r.text
    a, rc = r.json()["appointment"], r.json()["recommendation"]
    assert a["status"] == "confirmed" and a["is_followup"] is True and a["followup_of_appointment_id"] == src.id and a["token_no"] and a["booking_no"]
    assert rc["status"] == "accepted" and rc["appointment_id"] == a["id"]
    world.db.expire_all()
    row = world.db.get(PortalAppointment, a["id"])
    assert row.starts_at.replace(tzinfo=None) == utc_at(day_n(7), "11:00").replace(tzinfo=None) and row.reason == "Follow-up" and row.duration_minutes == 30
    assert kinds(world, dh, "doctor") == ["followup_recommendation_accepted"]
    assert world.client.get(f"{D}/followup-recommendations", headers=dh).json()["items"][0]["status"] == "accepted"
    assert audit(world, "followup_recommendation_accepted")[0].admin_id == pat.id
    assert accept(world, ph, rid).json()["detail"] == "INVALID_TRANSITION"                    # cannot accept twice
    assert world.client.get(f"{P}/appointments", headers=ph).json()["items"][0]["is_followup"] is True


def test_patient_can_choose_another_slot_of_same_doctor(world):
    doc, pat, dh, ph, src = setup(world)
    rid = rec(world, dh, src, day_n(7), "11:00").json()["id"]
    r = accept(world, ph, rid, day_n(9), "12:00")
    assert r.status_code == 200 and r.json()["appointment"]["doctor_id"] == doc.id
    assert r.json()["recommendation"]["status"] == "accepted"
    world.db.expire_all()
    assert world.db.get(PortalAppointment, r.json()["appointment"]["id"]).starts_at.replace(tzinfo=None) == utc_at(day_n(9), "12:00").replace(tzinfo=None)
    n = world.client.get(f"{D}/notifications", headers=dh).json()["items"][0]
    assert n["data"]["chose_other_slot"] is True


def test_slot_taken_before_accept_is_refused_and_patient_can_pick_another(world):
    doc, pat, dh, ph, src = setup(world)
    rid = rec(world, dh, src, day_n(7), "11:00").json()["id"]
    mk(world, world.user("patient"), doc, day_n(7), "11:00")                                  # somebody else books it first
    r = accept(world, ph, rid)
    assert r.status_code == 409 and r.json()["detail"] == "SLOT_UNAVAILABLE"
    world.db.expire_all()
    assert world.db.query(PortalAppointment).filter_by(patient_id=pat.id, is_followup=True).count() == 0   # nothing created
    assert world.db.get(PortalFollowupRecommendation, rid).status == "pending"                # still open
    assert world.client.get(f"{D}/notifications", headers=dh).json()["items"] == []           # doctor not told of a non-event
    assert accept(world, ph, rid, day_n(7), "11:30").status_code == 200                       # chooses another free slot


def test_accept_applies_all_booking_rules_and_leaves_recommendation_pending(world):
    doc, pat, dh, ph, src = setup(world)
    rid = rec(world, dh, src, day_n(7), "11:00").json()["id"]
    assert accept(world, ph, rid, day_n(31), "11:00").json()["detail"] == "TOO_FAR_AHEAD"
    assert accept(world, ph, rid, day_n(7), None).status_code == 422                          # date without time
    d2 = world.doctor(name="Dr. Two", department="Neurology"); h2 = world.headers(d2); put_all(world, h2, [S("10:00", "13:00")])
    mk(world, pat, d2, day_n(7), "11:00")                                                     # patient already busy at that time with another doctor
    assert accept(world, ph, rid).json()["detail"] == "PATIENT_OVERLAP"
    mk(world, pat, d2, day_n(8), "10:00"); mk(world, pat, d2, day_n(9), "10:00")              # now 3 upcoming (the overlap one + 2)
    world.db.query(PortalAppointment).filter_by(patient_id=pat.id, starts_at=utc_at(day_n(7), "11:00")).delete(); world.db.commit()
    mk(world, pat, d2, day_n(10), "10:00")
    r = accept(world, ph, rid)
    assert r.status_code == 409 and r.json()["detail"] == "BOOKING_LIMIT_REACHED"
    world.db.expire_all()
    assert world.db.get(PortalFollowupRecommendation, rid).status == "pending"


def test_decline_notifies_doctor_and_other_patient_gets_404(world):
    doc, pat, dh, ph, src = setup(world)
    rid = rec(world, dh, src, day_n(7), "11:00").json()["id"]
    stranger = world.headers(world.user("patient"))
    assert accept(world, stranger, rid).status_code == 404
    assert world.client.post(f"{P}/followup-recommendations/{rid}/decline", headers=stranger, json={}).status_code == 404
    r = world.client.post(f"{P}/followup-recommendations/{rid}/decline", headers=ph, json={"note": "I will call the clinic"})
    assert r.status_code == 200 and r.json()["status"] == "declined" and r.json()["response_note"] == "I will call the clinic"
    n = world.client.get(f"{D}/notifications", headers=dh).json()
    assert n["unread_count"] == 1 and n["items"][0]["kind"] == "followup_recommendation_declined"
    assert world.client.post(f"{P}/followup-recommendations/{rid}/decline", headers=ph, json={}).json()["detail"] == "INVALID_TRANSITION"
    assert len(audit(world, "followup_recommendation_declined")) == 1


def test_recommendation_expires_when_time_passes(world):
    doc, pat, dh, ph, src = setup(world)
    rid = rec(world, dh, src, day_n(7), "11:00").json()["id"]
    r = world.db.get(PortalFollowupRecommendation, rid); r.proposed_starts_at = r.proposed_starts_at - timedelta(days=10); world.db.commit()
    assert world.client.get(f"{D}/followup-recommendations", headers=dh).json()["items"][0]["status"] == "expired"
    assert accept(world, ph, rid).json()["detail"] == "INVALID_TRANSITION"
    assert world.client.post(f"{D}/followup-recommendations/{rid}/withdraw", headers=dh).json()["detail"] == "INVALID_TRANSITION"


# ------------------------------------------------------------------ doctor direct scheduling
def direct(w, dh, src, day, t, **kw):
    return w.client.post(f"{D}/appointments/{src.id}/followups", headers=dh, json={"date": day.isoformat(), "time": t, **kw})


def test_direct_schedule_requires_consent_and_records_it(world):
    doc, pat, dh, ph, src = setup(world)
    assert direct(world, dh, src, day_n(7), "11:00").status_code == 422                       # checkbox missing
    assert direct(world, dh, src, day_n(7), "11:00", patient_agreed=False).json()["detail"] == "VALIDATION_ERROR"
    world.db.expire_all()
    assert world.db.query(PortalAppointment).count() == 1
    r = direct(world, dh, src, day_n(7), "11:00", patient_agreed=True)
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["status"] == "confirmed" and j["is_followup"] is True and j["followup_of_appointment_id"] == src.id
    assert j["created_by_doctor_id"] == doc.id and j["patient_agreed"] is True and j["agreed_at"] and j["created_at"] and j["token_no"]
    assert kinds(world, ph, "patient") == ["followup_scheduled_by_doctor"]
    a = audit(world, "doctor_followup_scheduled")
    assert len(a) == 1 and a[0].admin_id == doc.id and a[0].new_value["patient_agreed"] is True
    assert world.client.get(f"{P}/appointments", headers=ph).json()["items"][0]["is_followup"] is True


def test_direct_schedule_applies_booking_rules(world):
    doc, pat, dh, ph, src = setup(world)
    assert direct(world, dh, src, day_n(31), "11:00", patient_agreed=True).json()["detail"] == "TOO_FAR_AHEAD"
    assert direct(world, dh, src, day_n(-1), "11:00", patient_agreed=True).status_code == 422
    mk(world, world.user("patient"), doc, day_n(7), "11:00")
    assert direct(world, dh, src, day_n(7), "11:00", patient_agreed=True).json()["detail"] == "SLOT_UNAVAILABLE"
    d2 = world.doctor(name="Dr. Two", department="Neurology"); put_all(world, world.headers(d2), [S("10:00", "13:00")])
    mk(world, pat, d2, day_n(8), "11:00")
    assert direct(world, dh, src, day_n(8), "11:00", patient_agreed=True).json()["detail"] == "PATIENT_OVERLAP"
    mk(world, pat, d2, day_n(9), "10:00"); mk(world, pat, d2, day_n(10), "10:00")
    r = direct(world, dh, src, day_n(11), "11:00", patient_agreed=True)
    assert r.status_code == 409 and r.json()["detail"] == "BOOKING_LIMIT_REACHED"
    other = world.headers(world.doctor(name="Dr. Y"))
    assert direct(world, other, src, day_n(7), "12:00", patient_agreed=True).status_code == 404
    world.db.expire_all()
    assert world.db.query(PortalAppointment).filter_by(is_followup=True).count() == 0


# ------------------------------------------------------------------ patient self-booked follow-up
def test_patient_self_booked_followup_is_flagged_with_optional_link(world):
    doc, pat, dh, ph, src = setup(world)
    plain = world.client.post(f"{P}/appointments", headers=ph, json={"doctor_id": doc.id, "date": day_n(5).isoformat(), "time": "10:00"})
    assert plain.status_code == 201 and plain.json()["is_followup"] is False and plain.json()["followup_of_appointment_id"] is None
    no_link = world.client.post(f"{P}/appointments", headers=ph, json={"doctor_id": doc.id, "date": day_n(6).isoformat(), "time": "10:00", "is_followup": True})
    assert no_link.status_code == 201 and no_link.json()["is_followup"] is True and no_link.json()["followup_of_appointment_id"] is None
    linked = world.client.post(f"{P}/appointments", headers=ph, json={"doctor_id": doc.id, "date": day_n(7).isoformat(), "time": "10:00", "followup_of_appointment_id": src.id})
    assert linked.status_code == 201 and linked.json()["is_followup"] is True and linked.json()["followup_of_appointment_id"] == src.id


def test_patient_followup_link_validation_and_rules_still_apply(world):
    doc, pat, dh, ph, src = setup(world)
    foreign = mk(world, world.user("patient"), doc, day_n(-2), "10:00", status="completed", visit="completed")
    body = lambda **kw: world.client.post(f"{P}/appointments", headers=ph, json={"doctor_id": doc.id, "date": day_n(7).isoformat(), "time": "10:00", **kw})
    assert body(followup_of_appointment_id=foreign.id).status_code == 404                     # not the patient's own visit
    assert body(followup_of_appointment_id=99999).status_code == 404
    later = mk(world, pat, doc, day_n(12), "10:00")
    assert body(followup_of_appointment_id=later.id).status_code == 422                       # not an EARLIER visit
    assert world.client.post(f"{P}/appointments", headers=ph, json={"doctor_id": doc.id, "date": day_n(31).isoformat(), "time": "10:00", "is_followup": True}).json()["detail"] == "TOO_FAR_AHEAD"


# ------------------------------------------------------------------ doctor notifications + migration
def test_doctor_notifications_list_read_and_scoping(world):
    doc, pat, dh, ph, src = setup(world)
    for i, t in enumerate(("11:00", "11:30")):
        rid = rec(world, dh, src, day_n(7 + i), t).json()["id"]
        world.client.post(f"{P}/followup-recommendations/{rid}/decline", headers=ph, json={})
    n = world.client.get(f"{D}/notifications", headers=dh).json()
    assert n["unread_count"] == 2 and len(n["items"]) == 2
    assert world.client.post(f"{D}/notifications/{n['items'][0]['id']}/read", headers=dh).json()["read_at"]
    assert world.client.get(f"{D}/notifications?unread_only=true", headers=dh).json()["unread_count"] == 1
    other = world.headers(world.doctor(name="Dr. Other"))
    assert world.client.post(f"{D}/notifications/{n['items'][1]['id']}/read", headers=other).status_code == 404
    assert world.client.get(f"{D}/notifications", headers=other).json()["items"] == []
    assert world.client.post(f"{D}/notifications/read-all", headers=dh).json()["unread_count"] == 0
    assert world.client.get(f"{D}/notifications", headers=ph).status_code == 403              # patients use /patient/notifications


def test_followup_endpoints_are_role_scoped(world):
    doc, pat, dh, ph, src = setup(world)
    assert world.client.get(f"{D}/followup-recommendations").status_code == 401
    assert world.client.get(f"{D}/followup-recommendations", headers=ph).status_code == 403
    assert world.client.get(f"{P}/followup-recommendations", headers=dh).status_code == 403


def test_migration_v009_adds_columns_to_old_schema_and_is_idempotent(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path}/old.db")
    Base.metadata.create_all(eng)
    with eng.begin() as c:
        for col in ("is_followup", "followup_of_appointment_id", "created_by_doctor_id", "patient_agreed", "agreed_at"):
            c.execute(text(f"ALTER TABLE portal_appointments DROP COLUMN {col}"))
        c.execute(text("DROP TABLE portal_followup_recommendations"))
    upgrade_v009(eng); upgrade_v009(eng)
    insp = inspect(eng)
    assert {"is_followup", "followup_of_appointment_id", "created_by_doctor_id", "patient_agreed", "agreed_at"} <= {c["name"] for c in insp.get_columns("portal_appointments")}
    assert "portal_followup_recommendations" in insp.get_table_names()


# ------------------------------------------------------------------ P5e-3e history + duplicate-notification guard
def test_patient_profile_followup_history_and_no_duplicate_notifications(world):
    doc, pat, dh, ph, src = setup(world)
    r1 = rec(world, dh, src, day_n(7), "11:00", note="n1").json()
    assert accept(world, ph, r1["id"]).status_code in (200, 201)                      # recommendation -> booked
    r2 = rec(world, dh, src, day_n(9), "11:00").json()                                 # stays pending
    d = world.client.post(f"{D}/appointments/{src.id}/followups", headers=dh, json={"date": day_n(10).isoformat(), "time": "12:00", "patient_agreed": True})
    assert d.status_code == 201
    h = world.client.get(f"{D}/patients/{pat.id}", headers=dh).json()["followups"]
    by = {(x["kind"], x["id"]): x for x in h}
    a1 = by[("recommendation", r1["id"])]
    assert a1["status"] == "accepted" and a1["appointment_id"] and a1["booking_source"] == "doctor_recommended" and a1["source_booking_no"] == src.booking_no
    p2 = by[("recommendation", r2["id"])]
    assert p2["status"] == "pending" and p2["appointment_id"] is None and p2["appointment_status"] is None   # a recommendation is not a booking
    direct = [x for x in h if x["kind"] == "appointment"]
    assert len(direct) == 1 and direct[0]["booking_source"] == "doctor_scheduled" and direct[0]["status"] is None
    assert not any(x["kind"] == "appointment" and x["id"] == a1["appointment_id"] for x in h)    # accepted booking is not listed twice
    # one notification per event on each side
    assert kinds(world, dh, "doctor").count("followup_recommendation_accepted") == 1
    assert kinds(world, ph, "patient").count("followup_recommended") == 2
    assert kinds(world, ph, "patient").count("followup_scheduled_by_doctor") == 1


def test_full_journey_completed_visit_to_confirmed_followup(world):
    """Completed consultation -> doctor recommends -> patient accepts -> confirmed follow-up -> notifications and history on both sides."""
    doc, pat, dh, ph, src = setup(world)
    r = rec(world, dh, src, day_n(7), "11:00", note="Bring reports"); assert r.status_code == 201
    assert kinds(world, ph, "patient") == ["followup_recommended"] and kinds(world, dh, "doctor") == []
    pending = world.client.get(f"{P}/followup-recommendations", headers=ph).json()["items"][0]
    assert pending["status"] == "pending"
    a = accept(world, ph, r.json()["id"]); assert a.status_code in (200, 201), a.text
    appts = world.client.get(f"{P}/appointments", headers=ph).json()["items"]
    fu_rows = [x for x in appts if x.get("is_followup")]
    assert len(fu_rows) == 1 and fu_rows[0]["status"] == "confirmed" and fu_rows[0]["token_no"] and fu_rows[0]["followup_of_appointment_id"] == src.id
    assert kinds(world, dh, "doctor") == ["followup_recommendation_accepted"]
    mine = world.client.get(f"{D}/followup-recommendations?appointment_id={src.id}", headers=dh).json()["items"][0]
    assert mine["status"] == "accepted" and mine["appointment_id"] == fu_rows[0]["id"]
    assert world.client.get(f"{D}/appointments/{fu_rows[0]['id']}", headers=dh).status_code == 200      # doctor can open the new visit
    hist = world.client.get(f"{D}/patients/{pat.id}", headers=dh).json()["followups"]
    assert len(hist) == 1 and hist[0]["appointment_status"] == "confirmed"
