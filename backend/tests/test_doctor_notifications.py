"""P5e-3d: the doctor's bell also hears about patient-side changes (proposal answered, appointment cancelled / moved)."""
from tests.test_availability import D, P, day_n, mk, propose, setup


def doc_notes(w, dh):
    return w.client.get(f"{D}/notifications", headers=dh).json()


def test_patient_accepts_or_declines_proposal_notifies_doctor(world):
    doc, pat, dh, ph = setup(world)
    a = mk(world, pat, doc, day_n(3), "10:00")
    pid = propose(world, dh, a, day_n(5), "11:00").json()["id"]
    assert doc_notes(world, dh)["unread_count"] == 0                      # proposing notifies the patient only
    assert world.client.post(f"{P}/reschedule-proposals/{pid}/accept", headers=ph).status_code == 200
    n = doc_notes(world, dh)["items"][0]
    assert n["kind"] == "reschedule_proposal_accepted" and n["data"]["appointment_id"] == a.id and n["data"]["proposal_id"] == pid

    b = mk(world, pat, doc, day_n(6), "10:00")
    pid2 = propose(world, dh, b, day_n(8), "11:00").json()["id"]
    assert world.client.post(f"{P}/reschedule-proposals/{pid2}/decline", headers=ph, json={"note": "Cannot make it"}).status_code == 200
    n = doc_notes(world, dh)["items"][0]
    assert n["kind"] == "reschedule_proposal_declined" and "Cannot make it" in n["message"] and n["data"]["appointment_id"] == b.id


def test_patient_cancel_and_reschedule_notify_doctor(world):
    doc, pat, dh, ph = setup(world)
    a = mk(world, pat, doc, day_n(3), "10:00")
    r = world.client.patch(f"{P}/appointments/{a.id}", headers=ph, json={"date": day_n(4).isoformat(), "time": "11:00"})
    assert r.status_code == 200, r.text
    assert doc_notes(world, dh)["items"][0]["kind"] == "appointment_rescheduled_by_patient"
    c = world.client.post(f"{P}/appointments/{a.id}/cancel", headers=ph)
    assert c.status_code == 200
    items = doc_notes(world, dh)["items"]
    assert items[0]["kind"] == "appointment_cancelled_by_patient" and items[0]["data"]["appointment_id"] == a.id
    assert doc_notes(world, dh)["unread_count"] == 2


def test_failed_patient_change_notifies_nobody(world):
    doc, pat, dh, ph = setup(world)
    a = mk(world, pat, doc, day_n(3), "10:00")
    bad = world.client.patch(f"{P}/appointments/{a.id}", headers=ph, json={"date": day_n(90).isoformat(), "time": "11:00"})
    assert bad.status_code == 422
    assert doc_notes(world, dh)["items"] == []
