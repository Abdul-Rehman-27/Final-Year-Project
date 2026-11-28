import os
import sys
import tempfile
from pathlib import Path

os.environ["MEDICAL_ASSISTANT_DB"] = str(Path(tempfile.mkdtemp()) / "test.sqlite3")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient

from app import api
from app.hospital_connector import HospitalConnector
from app.main import app
from test_hospital_connector import NOW, make_portal

calls = []


async def fake_chat(messages, max_tokens=700, json_mode=False, **_options):
    calls.append(messages)
    system = messages[0]["content"]
    if "Classify the patient's message" in system:
        return {"text": '{"intent": "hospital_info"}' if "where can i park" in messages[-1]["content"].lower() else '{"intent": "other"}'}
    return {"text": '{"type": "message", "message": "MODEL ANSWER"}', "usage": {}, "provider": "fake", "model": "fake"}


def send(client, text):
    conversation = client.post("/api/v1/chat/sessions", json={"patient_id": "p1"}).json()["id"]
    reply = client.post(f"/api/v1/chat/sessions/{conversation}/messages", json={"patient_id": "p1", "message": text})
    assert reply.status_code == 200
    return reply.json()


def setup(monkeypatch, tmp_path):
    url, _ = make_portal(tmp_path)
    monkeypatch.setattr(api, "connector", HospitalConnector(url, now=lambda: NOW))
    monkeypatch.setattr(api, "chat", fake_chat)
    calls.clear()


def test_doctor_question_returns_real_doctor_cards(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        reply = send(client, "Which cardiologist is available on Monday?")
    card = reply["structured"]
    assert card["type"] == "doctors" and card["booking_enabled"] is False
    assert card["doctors"][0]["name"] == "Dr. Sana Malik"
    assert card["doctors"][0]["date"] == "2026-11-30" and card["doctors"][0]["slots"] == ["10:00", "10:30", "11:30"]
    assert "Dr. Sana Malik" in reply["answer"] and calls == []     # no model call for a clear doctor question


def test_next_free_day_is_used_when_no_day_is_named(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        reply = send(client, "Book an appointment with a cardiologist")
    assert reply["structured"]["doctors"][0]["date"] == "2026-11-30"


def test_hospital_info_by_rules_and_by_model(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        reply = send(client, "What are the visiting hours?")
        assert reply["structured"]["type"] == "hospital" and reply["structured"]["hospital"]["emergency_number"] == "021-555-0100"
        assert "Main Road" in reply["answer"] and calls == []
        reply = send(client, "where can i park my car")          # no rule matches: the model classifier decides
        assert reply["structured"]["type"] == "hospital"


def test_symptoms_unknown_doctors_and_unconfigured_use_the_old_flow(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    with TestClient(app) as client:
        assert send(client, "I have chest pain and dizziness since morning")["answer"] == "MODEL ANSWER"
        assert send(client, "Is Dr Nobody available tomorrow?")["answer"] in {api.no_data_message(l) for l in ("english", "urdu", "roman")}
        monkeypatch.setattr(api, "connector", HospitalConnector("", now=lambda: NOW))
        structured = send(client, "What are the visiting hours?")["structured"]
        assert structured is None or structured.get("type") != "hospital"


def test_local_booking_still_works_when_the_connector_is_off(monkeypatch, tmp_path):
    monkeypatch.setattr(api, "connector", HospitalConnector("", now=lambda: NOW))
    monkeypatch.setattr(api, "chat", fake_chat)
    with TestClient(app) as client:
        client.post("/api/v1/integrations/doctors", json={"id": "d9", "name": "Dr. Local Doc", "specialty": "Cardiology", "hospital": "City Hospital", "availability": ["2026-12-02 10:00"]})
        conversation = client.post("/api/v1/chat/sessions", json={"patient_id": "p1"}).json()["id"]
        url = f"/api/v1/chat/sessions/{conversation}/messages"
        first = client.post(url, json={"patient_id": "p1", "message": "Book Dr. Local Doc"}).json()["answer"]
        assert "confirm" in first.lower()
        assert "booked" in client.post(url, json={"patient_id": "p1", "message": "yes"}).json()["answer"].lower()
