"""Step 4: the portal relays the outcome of a chat booking action; the appointment shown comes from the portal's own record."""
from app.api.v1.routes import chatbot as chatbot_routes
from app.models.chatbot import ChatConversation, ChatMessage
from app.services.medical_assistant_client import MedicalAssistantError

URL = "/api/v1/chat/sessions"


def conversation(world, patient):
    row = ChatConversation(medical_assistant_id=f"remote-{patient.id}", patient_id=patient.id)
    world.db.add(row); world.db.commit(); return row


def fake_remote(monkeypatch, answer=None, error=None):
    calls = []

    async def fake(method, path, *, json=None, params=None, timeout=None):
        calls.append((method, path, json))
        if error:
            raise MedicalAssistantError(error)
        return answer or {"answer": "done", "structured": {"type": "appointment"}, "language": "english"}
    monkeypatch.setattr(chatbot_routes, "request", fake)
    return calls


def test_success_sends_the_portals_own_appointment_record_to_the_assistant(world, monkeypatch):
    doc, pat = world.doctor(), world.user("patient")
    appointment = world.appt(pat, doc, days=2)
    row = conversation(world, pat); calls = fake_remote(monkeypatch)
    reply = world.client.post(f"{URL}/{row.id}/action-result", json={"action_id": "abc", "ok": True, "appointment_id": appointment.id}, headers=world.headers(pat))
    assert reply.status_code == 200 and reply.json()["answer"] == "done"
    method, path, sent = calls[0]
    assert path == "/api/v1/chat/sessions/remote-%d/action-result" % pat.id and sent["patient_id"] == str(pat.id)
    assert sent["data"]["token_no"] == appointment.token_no and sent["data"]["doctor_name"] == doc.full_name and sent["data"]["booking_no"] == appointment.booking_no
    assert world.db.query(ChatMessage).filter_by(conversation_id=row.id, role="assistant").count() == 1


def test_failure_passes_only_the_code(world, monkeypatch):
    pat = world.user("patient"); row = conversation(world, pat); calls = fake_remote(monkeypatch)
    assert world.client.post(f"{URL}/{row.id}/action-result", json={"action_id": "abc", "ok": False, "code": "SLOT_UNAVAILABLE"}, headers=world.headers(pat)).status_code == 200
    assert calls[0][2]["ok"] is False and calls[0][2]["code"] == "SLOT_UNAVAILABLE" and calls[0][2]["data"] is None


def test_other_patients_cannot_use_a_conversation_or_an_appointment(world, monkeypatch):
    doc, pat, other = world.doctor(), world.user("patient"), world.user("patient")
    theirs = world.appt(other, doc, days=2)
    row = conversation(world, pat); fake_remote(monkeypatch)
    body = {"action_id": "abc", "ok": True, "appointment_id": theirs.id}
    assert world.client.post(f"{URL}/{row.id}/action-result", json=body, headers=world.headers(pat)).status_code == 404      # someone else's appointment
    assert world.client.post(f"{URL}/{row.id}/action-result", json=body, headers=world.headers(other)).status_code == 404    # someone else's conversation
    assert world.client.post(f"{URL}/{row.id}/action-result", json=body).status_code == 401
    assert world.client.post(f"{URL}/{row.id}/action-result", json={"action_id": "abc", "ok": True}, headers=world.headers(pat)).status_code == 404   # success without an appointment


def test_unknown_request_is_a_409_and_assistant_down_is_a_503(world, monkeypatch):
    pat = world.user("patient"); row = conversation(world, pat)
    fake_remote(monkeypatch, error="Medical Assistant returned HTTP 409: No waiting request with this id.")
    assert world.client.post(f"{URL}/{row.id}/action-result", json={"action_id": "x", "ok": False}, headers=world.headers(pat)).status_code == 409
    fake_remote(monkeypatch, error="Medical Assistant request failed: ConnectError")
    assert world.client.post(f"{URL}/{row.id}/action-result", json={"action_id": "x", "ok": False}, headers=world.headers(pat)).status_code == 503


def test_chat_messages_tell_the_assistant_the_portal_can_book(world, monkeypatch):
    pat = world.user("patient"); row = conversation(world, pat); calls = fake_remote(monkeypatch, answer={"answer": "hi", "structured": None, "provider": "hospital", "usage": {}})
    reply = world.client.post(f"{URL}/{row.id}/messages", json={"message": "hello"}, headers=world.headers(pat))
    assert reply.status_code == 200, reply.text
    assert calls[0][2]["portal_bridge"] is True and calls[0][2]["patient_id"] == str(pat.id)
