"""Step 4: typed book / reschedule / cancel through the portal bridge (the assistant only talks and relays; the portal writes)."""
import os
import sys
import tempfile
from pathlib import Path

os.environ["MEDICAL_ASSISTANT_DB"] = str(Path(tempfile.mkdtemp()) / "test.sqlite3")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient
from sqlalchemy import text

from app import api
from app.hospital_connector import HospitalConnector
from app.main import app
from test_hospital_connector import NOW, make_portal

PATIENT = "99"


async def fake_chat(messages, max_tokens=700, json_mode=False, **_options):
    if "Classify the patient's message" in messages[0]["content"]:
        return {"text": '{"intent": "other"}'}
    return {"text": '{"type": "message", "message": "MODEL ANSWER"}', "usage": {}, "provider": "fake", "model": "fake"}


def setup(monkeypatch, tmp_path, appointments=()):
    url, engine = make_portal(tmp_path)
    with engine.begin() as c:
        for row in appointments:
            c.execute(text("INSERT INTO portal_appointments (id, patient_id, doctor_id, starts_at, status, duration_minutes, token_no, booking_no, room_label, visit_status) VALUES "
                           "(:id, 99, 10, :at, :status, 30, :token, :booking, 'Room 4', 'scheduled')"), row)
    monkeypatch.setattr(api, "connector", HospitalConnector(url, now=lambda: NOW))
    monkeypatch.setattr(api, "chat", fake_chat)


def appt(id, at, token, status="confirmed"):
    return {"id": id, "at": at, "status": status, "token": token, "booking": f"APT-{id:04d}"}


class Chat:
    def __init__(self, client, bridge=True):
        self.client, self.bridge = client, bridge
        self.id = client.post("/api/v1/chat/sessions", json={"patient_id": PATIENT}).json()["id"]

    def say(self, message):
        reply = self.client.post(f"/api/v1/chat/sessions/{self.id}/messages", json={"patient_id": PATIENT, "message": message, "portal_bridge": self.bridge})
        assert reply.status_code == 200, reply.text
        return reply.json()

    def outcome(self, action_id, ok, data=None, code=None):
        return self.client.post(f"/api/v1/chat/sessions/{self.id}/action-result", json={"patient_id": PATIENT, "action_id": action_id, "ok": ok, "data": data, "code": code})


BOOK = "Book Dr. Sana Malik on 2026-11-30 at 10:30"


def test_booking_asks_then_hands_the_request_to_the_portal_and_shows_the_portals_token(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        chat = Chat(client)
        ask = chat.say(BOOK)
        assert ask["structured"]["type"] == "confirm" and ask["structured"]["appointment"]["time"] == "10:30"
        assert "Reply yes" in ask["answer"] and "Dr. Sana Malik" in ask["answer"]
        go = chat.say("yes")
        action = go["structured"]
        assert action["type"] == "portal_action" and action["action"] == "book"
        assert action["params"] == {"doctor_id": 10, "date": "2026-11-30", "time": "10:30"}      # only ids and the chosen slot, never a patient id or token
        assert "patient" not in str(action).lower()
        portal_answer = {"id": 7, "starts_at": "2026-11-30T05:30:00+00:00", "doctor_name": "Dr. Sana Malik", "department": "Cardiology", "token_no": "A025", "booking_no": "APT-0007", "room_label": "Room 4", "status": "confirmed"}
        done = chat.outcome(action["action_id"], True, portal_answer)
        assert done.status_code == 200
        body = done.json()
        assert body["structured"]["appointment"]["token_no"] == "A025" and "A025" in body["answer"] and "10:30" in body["answer"]
        assert chat.outcome(action["action_id"], True, portal_answer).status_code == 409           # one request, one answer
        assert chat.say("yes")["answer"] == "MODEL ANSWER"                                         # a repeated yes cannot book again


def test_no_declines_and_nothing_is_sent_to_the_portal(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        chat = Chat(client)
        chat.say(BOOK)
        reply = chat.say("no")
        assert reply["structured"] is None and "nothing was changed" in reply["answer"]
        assert chat.say("yes")["answer"] == "MODEL ANSWER"


def test_taken_time_offers_free_times_and_error_codes_are_shown(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path, [appt(1, "2026-11-30 05:30:00.000000", "A001")])
    with TestClient(app) as client:
        chat = Chat(client)
        taken = chat.say(BOOK)                                    # 10:30 is already booked by the fixture appointment
        assert taken["structured"]["type"] == "doctors" and taken["structured"]["doctors"][0]["slots"] == ["10:00", "11:30"]
        chat.say("Book Dr. Sana Malik on 2026-11-30 at 11:30")
        action = chat.say("yes")["structured"]
        failed = chat.outcome(action["action_id"], False, code="SLOT_UNAVAILABLE").json()
        assert "SLOT_UNAVAILABLE" in failed["answer"] and "just taken" in failed["answer"]
        assert failed["structured"]["type"] == "doctors" and failed["structured"]["booking_enabled"] is True


def test_booking_limit_and_unknown_codes_show_the_reason(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        chat = Chat(client)
        chat.say(BOOK)
        action = chat.say("yes")["structured"]
        assert "maximum of 3" in chat.outcome(action["action_id"], False, code="BOOKING_LIMIT_REACHED").json()["answer"]
        chat.say(BOOK)
        action = chat.say("yes")["structured"]
        timed_out = chat.outcome(action["action_id"], False, code="NO_RESPONSE").json()
        assert "My appointments" in timed_out["answer"] and timed_out["structured"] is None


def test_cancel_with_one_appointment(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path, [appt(1, "2026-11-30 05:30:00.000000", "A001")])
    with TestClient(app) as client:
        chat = Chat(client)
        ask = chat.say("I want to cancel my appointment")
        assert ask["structured"]["type"] == "confirm" and ask["structured"]["action"] == "cancel"
        action = chat.say("yes")["structured"]
        assert action["action"] == "cancel" and action["params"] == {"appointment_id": 1}
        done = chat.outcome(action["action_id"], True, {"id": 1, "status": "cancelled"}).json()
        assert "cancelled" in done["answer"] and "10:30" in done["answer"]


def test_cancel_with_several_asks_which_one(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path, [appt(1, "2026-11-30 05:30:00.000000", "A001"), appt(2, "2026-11-30 05:00:00.000000", "A002"), appt(3, "2026-11-23 05:00:00.000000", "A003"), appt(4, "2026-12-07 05:00:00.000000", "A004", "cancelled")])
    with TestClient(app) as client:
        chat = Chat(client)
        pick = chat.say("cancel my appointment")
        assert "1." in pick["answer"] and "2." in pick["answer"] and "3." not in pick["answer"]   # past and already-cancelled ones are not offered
        assert "10:00" in pick["answer"].split("\n")[1]                                            # sorted by time
        assert chat.say("hello?")["answer"].startswith("Please reply with the number")
        ask = chat.say("2")
        assert ask["structured"]["appointment"]["time"] == "10:30"
        assert chat.say("yes")["structured"]["params"] == {"appointment_id": 1}


def test_reschedule_moves_to_a_free_slot_of_the_same_doctor(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path, [appt(1, "2026-11-30 05:30:00.000000", "A001")])
    with TestClient(app) as client:
        chat = Chat(client)
        ask = chat.say("Can I reschedule my appointment?")
        assert ask["structured"]["type"] == "doctors" and ask["structured"]["doctors"][0]["slots"] == ["10:00", "10:30", "11:30"]   # own booking does not block itself
        assert chat.say("Dec 1 9:00")["structured"]["type"] == "doctors"                         # Tuesday: nothing free
        confirm = chat.say("2026-11-30 11:30")
        assert confirm["structured"]["type"] == "confirm" and confirm["structured"]["action"] == "reschedule"
        action = chat.say("yes")["structured"]
        assert action["params"] == {"appointment_id": 1, "date": "2026-11-30", "time": "11:30"}
        done = chat.outcome(action["action_id"], True, {"id": 1, "starts_at": "2026-11-30T06:30:00+00:00", "doctor_name": "Dr. Sana Malik", "token_no": "A001", "booking_no": "APT-0001", "room_label": "Room 4"}).json()
        assert "has been moved" in done["answer"] and "11:30" in done["answer"] and "A001" in done["answer"]


def test_roman_urdu_yes_keeps_the_conversation_language(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        chat = Chat(client)
        chat.say("Mujhe Dr. Sana Malik ke saath appointment book karni hai, mujhe 2026-11-30 ko 10:00 par chahiye")
        go = chat.say("haan")
        assert go["structured"]["type"] == "portal_action"
        done = chat.outcome(go["structured"]["action_id"], True, {"id": 8, "starts_at": "2026-11-30T05:00:00+00:00", "token_no": "A010"}).json()
        assert done["language"] == "roman" and "book ho gayi" in done["answer"] and "A010" in done["answer"]


def test_without_the_portal_bridge_nothing_is_proposed_and_without_a_connection_either(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        reply = Chat(client, bridge=False).say(BOOK)
        assert reply["structured"] is None or reply["structured"]["type"] not in ("confirm", "portal_action")
        monkeypatch.setattr(api, "connector", HospitalConnector("", now=lambda: NOW))
        reply = Chat(client).say(BOOK)
        assert reply["structured"] is None or reply["structured"]["type"] not in ("confirm", "portal_action")


def test_specialty_only_still_shows_cards_with_booking_enabled(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        reply = Chat(client).say("Book an appointment with a cardiologist")
        assert reply["structured"]["type"] == "doctors" and reply["structured"]["booking_enabled"] is True


def test_forged_action_id_is_refused(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        assert Chat(client).outcome("not-a-real-id", True, {"id": 1}).status_code == 409
