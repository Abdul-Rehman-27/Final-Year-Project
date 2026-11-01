import os
import sys
import tempfile
from pathlib import Path

# Use a temporary database so the test never touches real data.
os.environ["MEDICAL_ASSISTANT_DB"] = str(Path(tempfile.mkdtemp()) / "test.sqlite3")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app import api
from app.main import app

NO_DATA_TEXTS = {api.no_data_message("english"), api.no_data_message("urdu"), api.no_data_message("roman")}
calls = []


async def fake_chat(messages, max_tokens=700, json_mode=False):
    # Stand-in for the real model. It records what the model was sent.
    calls.append({"messages": messages, "max_tokens": max_tokens})
    return {"text": "MODEL ANSWER", "usage": {}, "provider": "fake", "model": "fake"}


api.chat = fake_chat

ENGLISH_CHILD = "Doctor, my daughter has had a fever since last night. It went up to 102 and came down a little after I gave her syrup, but it came back by morning. She doesn't want to eat, says her throat hurts when she swallows, and she kept crying at night because of an ear pain. Her nose has been running for two days too. She's 6 years old and has no allergies that I know of."
ENGLISH_DIABETES = "Doctor, it started about a week ago. I felt a dull headache behind my eyes. By Tuesday evening I also started feeling very thirsty. I had to wake up two or three times at night to use the washroom, which never happens to me. My vision was a bit blurry for a few minutes. I'm also taking my regular medicines, but I missed them for about three days last week because I was travelling. Could that be the reason?"
URDU_DIABETES = "ڈاکٹر صاحب، میری آنکھوں کے پیچھے ہلکا سا سر درد شروع ہو گیا۔ مجھے بہت پیاس بھی لگنے لگی۔ میں اپنی روزانہ کی دوائیں بھی لے رہا ہوں، لیکن سفر کی وجہ سے پچھلے ہفتے تین دن دوا نہیں لی۔ کیا یہ اس کی وجہ ہو سکتی ہے؟"
ROMAN_CHILD = "Doctor sahab, meri beti ko kal raat se bukhar hai. Bukhar 102 tak chala gaya tha aur syrup dene ke baad thora kam hua, lekin subah tak phir wapas aa gaya. Woh kuch khana nahi chahti, kehti hai ke nigalte waqt gale mein dard hota hai, aur raat bhar kaan ke dard ki wajah se roti rahi."


def new_conversation(client):
    return client.post("/api/v1/chat/sessions", json={"patient_id": "p1"}).json()["id"]


def send(client, conversation_id, text):
    reply = client.post(f"/api/v1/chat/sessions/{conversation_id}/messages", json={"patient_id": "p1", "message": text})
    assert reply.status_code == 200
    return reply.json()


def test_symptom_messages_reach_the_model():
    with TestClient(app) as client:
        for text in (ENGLISH_CHILD, ENGLISH_DIABETES, URDU_DIABETES, ROMAN_CHILD):
            calls.clear()
            answer = send(client, new_conversation(client), text)["answer"]
            assert answer == "MODEL ANSWER", text[:40]
            assert len(calls) == 1
            assert calls[0]["max_tokens"] == 2000


def test_history_is_oldest_first_and_skips_canned_replies():
    with TestClient(app) as client:
        conversation_id = new_conversation(client)
        send(client, conversation_id, "hye")
        # Pretend an old canned reply was saved before the fix.
        with api.db.connect() as conn:
            conn.execute("INSERT INTO messages(conversation_id, role, content) VALUES (?, 'assistant', ?)", (conversation_id, api.NO_DATA))
        calls.clear()
        send(client, conversation_id, ROMAN_CHILD)
        history = calls[0]["messages"][2:]
        assert history[0]["content"] == "hye"
        assert history[-1]["content"] == ROMAN_CHILD
        assert all(item["content"] != api.NO_DATA for item in history)


def test_empty_model_reply_is_not_the_no_data_message():
    async def empty_chat(messages, max_tokens=700, json_mode=False):
        return {"text": "", "usage": {}, "provider": "fake", "model": "fake"}

    api.chat = empty_chat
    try:
        with TestClient(app) as client:
            answer = send(client, new_conversation(client), ENGLISH_DIABETES)["answer"]
            assert answer == api.NO_REPLY_MESSAGE
            assert answer not in NO_DATA_TEXTS
    finally:
        api.chat = fake_chat


def test_booking_and_availability_use_the_data_path():
    with TestClient(app) as client:
        calls.clear()
        answer = send(client, new_conversation(client), "Book an appointment for me with a cardiologist")["answer"]
        assert answer in NO_DATA_TEXTS  # no doctors are stored in the test database
        answer = send(client, new_conversation(client), "Is Dr Ayesha Khan available tomorrow?")["answer"]
        assert answer in NO_DATA_TEXTS
        answer = send(client, new_conversation(client), "Has my report arrived?")["answer"]
        assert answer in NO_DATA_TEXTS
        assert calls == []  # the model was never called for these

        # With a doctor stored, the same question gets a real answer.
        client.post("/api/v1/integrations/doctors", json={"id": "d1", "name": "Dr. Ayesha Khan", "specialty": "Cardiology", "hospital": "City Hospital", "availability": ["2026-11-02 10:00"]})
        answer = send(client, new_conversation(client), "Is Dr Ayesha Khan available tomorrow?")["answer"]
        assert "2026-11-02 10:00" in answer