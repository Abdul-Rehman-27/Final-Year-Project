from __future__ import annotations

import json
import asyncio
import re
import time
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pypdf import PdfReader

from app import db
from app.core import settings
from app.llm import chat, connectivity
from app.security import require_scope

router = APIRouter(prefix="/api/v1")
NO_DATA = "I couldn't find that information in the connected records. Please check with the hospital team or connect the relevant data source."
SUMMARY_FIELDS = ["patient_overview", "chief_complaint", "medical_history", "surgical_history", "medications", "allergies", "family_history", "social_history", "vitals_and_results", "assessment_and_plan"]
PATIENT_RECORD_TERMS = ("report", "prescription", "arrived", "status", "رپورٹ", "نسخہ", "پرچی")
APPOINTMENT_TERMS = ("appointment", "appointments", "slot", "slots", "book", "schedule", "اپائنٹمنٹ")
AVAILABILITY_TERMS = ("available", "availability", "دستیاب", "موجود")
# Words that, together with "doctor", mean the patient is looking for a doctor.
# Common words like "who", "which" and "for" are NOT here because they appear in normal symptom messages.
DOCTOR_WORDS = ("doctor", "doctors", "ڈاکٹر")
DOCTOR_LOOKUP_WORDS = AVAILABILITY_TERMS + ("specialist", "find", "show", "کون", "کس")
# If a message has these words it is describing a health problem, so it goes to the LLM
# unless the patient also clearly asks for an appointment or availability.
SYMPTOM_TERMS = (
    "fever", "pain", "ache", "headache", "cough", "cold", "thirsty", "thirst", "vomiting", "nausea", "dizzy", "rash",
    "swelling", "bleeding", "tired", "fatigue", "breath", "blurry", "symptoms", "throat", "ear", "diabetes", "sugar",
    "bukhar", "dard", "khansi", "gala", "kaan", "naak", "pyas", "ulti", "chakkar", "thakan",
    "بخار", "درد", "کھانسی", "گلے", "کان", "ناک", "پیاس", "تھکن", "چکر", "الٹی", "سانس", "زخم",
)
NO_REPLY_MESSAGE = "I couldn't generate a reply just now. Please try sending your message again."
MODEL_DOWN_MESSAGE = "I can't reach the medical assistant model right now. Please try again shortly."


class NewConversation(BaseModel):
    patient_id: str = Field(min_length=1, max_length=128)
    title: str = Field(default="New conversation", max_length=160)


class MessageRequest(BaseModel):
    patient_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=settings.MAX_MESSAGE_CHARS)


class PatientRecord(BaseModel):
    patient_id: str = Field(min_length=1, max_length=128)
    category: str = Field(min_length=1, max_length=60)
    content: str = Field(min_length=1, max_length=50000)
    metadata: dict = Field(default_factory=dict)


class DoctorRecord(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=160)
    specialty: str = Field(min_length=1, max_length=160)
    hospital: str = Field(min_length=1, max_length=200)
    availability: list[str] = Field(default_factory=list, max_length=100)


def has_term(text: str, terms: tuple[str, ...]) -> bool:
    """Match complete words/phrases, including Urdu terms, rather than substrings."""
    return any(re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text, re.IGNORECASE) for term in terms)


def no_data_for(question: str) -> bool:
    # Patient-specific record questions and explicit appointment intents need
    # connected data. Merely addressing the assistant as "doctor" does not.
    asks_for_appointment = has_term(question, APPOINTMENT_TERMS) or has_term(question, AVAILABILITY_TERMS)
    # A message that describes symptoms and does not ask for an appointment goes to the LLM.
    if has_term(question, SYMPTOM_TERMS) and not asks_for_appointment:
        return False
    return has_term(question, PATIENT_RECORD_TERMS) or asks_for_appointment or (
        has_term(question, DOCTOR_WORDS) and has_term(question, DOCTOR_LOOKUP_WORDS)
    )


def language_of(text: str) -> str:
    # Any Urdu letters mean the patient wrote in Urdu script.
    if re.search(r"[\u0600-\u06ff]", text):
        return "urdu"
    # Roman Urdu: look for a few common Roman Urdu words.
    roman_words = r"\b(kya|hai|hain|ka|ki|ko|mera|meri|mujhe|dawa|batao|karna|chahiye|milega|mili|karwao|beti|beta|bukhar|dard|kaan|gala|naak|nahi|kuch|mein|raat|subah|thora|wapas|waqt|sahab|kal)\b"
    if re.search(roman_words, text.lower()):
        return "roman"
    return "english"


def no_data_message(language: str) -> str:
    if language == "urdu":
        return "آپ کی منسلک معلومات میں اس سوال کا جواب موجود نہیں۔ براہِ کرم ہسپتال کی ٹیم سے رابطہ کریں یا متعلقہ ریکارڈ منسلک کروائیں۔"
    if language == "roman":
        return "Aap ke connected records mein is sawal ka jawab mojood nahi. Barah-e-karam hospital team se rabta karein ya mutaliqa record connect karwayein."
    return "I couldn't find that information in the connected records. Please check with the hospital team or connect the relevant data source."


def doctor_list(doctors: list[dict], language: str) -> str:
    if language == "urdu":
        return "دستیاب ڈاکٹر اور اوقات:\n" + "\n".join(f"• {doc['name']} — {doc['specialty']}، {doc['hospital']}؛ اوقات: {', '.join(doc['availability']) or 'فی الحال کوئی وقت دستیاب نہیں'}" for doc in doctors)
    if language == "roman":
        return "Available doctors aur slots:\n" + "\n".join(f"• {doc['name']} — {doc['specialty']}, {doc['hospital']}; waqt: {', '.join(doc['availability']) or 'filhal koi waqt available nahi'}" for doc in doctors)
    return "Available doctors and slots:\n" + "\n".join(f"• {doc['name']} — {doc['specialty']}, {doc['hospital']}; slots: {', '.join(doc['availability']) or 'none currently available'}" for doc in doctors)


def find_patient_facts(patient_id: str, question: str):
    with db.connect() as conn:
        rows = conn.execute("SELECT category, content, metadata FROM patient_records WHERE patient_id=? ORDER BY created_at DESC LIMIT 100", (patient_id,)).fetchall()
    terms = {part for part in re.findall(r"[\w\u0600-\u06ff]+", question.lower()) if len(part) > 2}
    matches = []
    for row in rows:
        content = f"{row['category']} {row['content']}".lower()
        if not terms or any(term in content for term in terms):
            matches.append({"category": row["category"], "content": row["content"], "metadata": db.json_value(row["metadata"], {})})
    return matches[:8]


def doctor_matches(question: str):
    ignored = {"what", "which", "who", "when", "where", "doctor", "doctors", "hospital", "available", "availability", "appointment", "appointments", "schedule", "slot", "slots", "book", "find", "show", "tell", "there", "with", "from", "this", "that", "have", "free", "open", "dr", "for", "the", "are", "is", "any", "at"}
    terms = {part for part in re.findall(r"[a-zA-Z]+", question.lower()) if len(part) > 2 and part not in ignored}
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM doctors").fetchall()
        booked = conn.execute("SELECT doctor_id, slot FROM appointments WHERE status='booked'").fetchall()
    occupied = {(row["doctor_id"], row["slot"]) for row in booked}
    result = []
    for row in rows:
        doctor = db.row_dict(row)
        doctor["availability"] = [slot for slot in db.json_value(doctor["availability"], []) if (doctor["id"], slot) not in occupied]
        source = f"{doctor['name']} {doctor['specialty']} {doctor['hospital']}".lower()
        if not terms or any(term in source for term in terms):
            result.append(doctor)
    return result


REPLY_SYSTEM_PROMPT = """You are a cautious medical information assistant for a hospital. Reply with ONE JSON object only, no other text.

Use this exact JSON shape:
{
  "type": "medical" or "message",
  "message": "short text, only when type is message",
  "symptoms": ["short symptom", "..."],
  "condition": "one short sentence describing the patient's situation",
  "possible_causes": ["possible cause", "..."],
  "quick_tips": ["short precaution or tip", "..."],
  "emergency": {"level": "emergency" or "see_doctor_soon" or "not_emergency", "reason": "one short sentence"},
  "follow_up_question": "one short question, or empty string"
}

Rules:
- Use type "medical" when the patient describes symptoms or asks a medical question. Fill the sections that apply and use [] or "" for the rest.
- Use type "message" for greetings, nonsense, silly text, or off-topic questions. Put a short, calm, polite reply in "message" and invite the patient to ask a medical or appointment question. Do not answer off-topic requests. Leave the other fields empty.
- Keep everything SHORT. Maximum 5 symptoms, 3 possible causes, 4 quick tips. Each item is a few words, not a full paragraph.
- Wrap the most important words in each item with **double asterisks**, for example "**stay hydrated** with small sips". Use at most one or two highlighted phrases per item.
- possible_causes are only possibilities, never a diagnosis. Never name a specific medicine dose.
- emergency.level: "emergency" for danger signs such as chest pain, trouble breathing, fainting, severe bleeding, signs of stroke, confusion, seizures, a very high fever in a baby, or being unable to keep fluids down. "see_doctor_soon" when symptoms are strong, last several days, or involve dehydration or dizziness. "not_emergency" otherwise.
- Never invent patient, hospital, appointment, report, prescription, medicine, doctor or schedule facts. Use only the verified patient records you are given. If information is missing, say it is unavailable.
- Write every text value in the patient's language and script, as told in the last system message. Keep the JSON keys in English.
"""

LANGUAGE_NAMES = {
    "english": "English",
    "urdu": "Urdu written in Urdu script",
    "roman": "Roman Urdu (Urdu written in English letters, for example 'aap ko bukhar hai')",
}

# Labels used when the structured reply is turned into plain text (older clients and saved history).
LABELS = {
    "english": {"symptoms": "Symptoms", "condition": "Condition", "possible_causes": "Possible causes", "quick_tips": "Quick tips", "emergency": "Emergency check",
                "levels": {"emergency": "EMERGENCY - seek care now", "see_doctor_soon": "See a doctor soon", "not_emergency": "Not an emergency right now"}},
    "urdu": {"symptoms": "علامات", "condition": "حالت", "possible_causes": "ممکنہ وجوہات", "quick_tips": "فوری مشورے", "emergency": "ایمرجنسی کی جانچ",
             "levels": {"emergency": "ایمرجنسی - فوراً طبی مدد لیں", "see_doctor_soon": "جلد ڈاکٹر کو دکھائیں", "not_emergency": "فی الحال ایمرجنسی نہیں"}},
    "roman": {"symptoms": "Alamaat", "condition": "Halat", "possible_causes": "Mumkin wajohaat", "quick_tips": "Fori mashwaray", "emergency": "Emergency check",
              "levels": {"emergency": "EMERGENCY - foran madad lein", "see_doctor_soon": "Jald doctor ko dikhayen", "not_emergency": "Filhal emergency nahi"}},
}


def clean_list(value, limit):
    """Keep only short non-empty strings, at most `limit` of them."""
    if not isinstance(value, list):
        return []
    return [str(item).strip()[:200] for item in value if str(item).strip()][:limit]


def parse_structured_reply(text: str):
    """Turn the model's JSON text into a safe dictionary. Returns None if it is not usable."""
    raw = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    if data.get("type") == "message":
        message = str(data.get("message", "")).strip()
        return {"type": "message", "message": message} if message else None
    emergency = data.get("emergency") if isinstance(data.get("emergency"), dict) else {}
    level = emergency.get("level")
    if level not in ("emergency", "see_doctor_soon", "not_emergency"):
        level = "see_doctor_soon"
    reply = {
        "type": "medical",
        "symptoms": clean_list(data.get("symptoms"), 5),
        "condition": str(data.get("condition", "")).strip()[:300],
        "possible_causes": clean_list(data.get("possible_causes"), 3),
        "quick_tips": clean_list(data.get("quick_tips"), 4),
        "emergency": {"level": level, "reason": str(emergency.get("reason", "")).strip()[:300]},
        "follow_up_question": str(data.get("follow_up_question", "")).strip()[:300],
    }
    # A medical reply with nothing in it is not useful.
    if not (reply["symptoms"] or reply["condition"] or reply["possible_causes"] or reply["quick_tips"]):
        return None
    return reply


def structured_to_text(reply: dict, language: str) -> str:
    """Plain-text version of the reply. It is saved as the message text and used as chat history."""
    if reply["type"] == "message":
        return reply["message"]
    labels = LABELS[language]
    lines = []
    if reply["symptoms"]:
        lines.append(f"{labels['symptoms']}: " + "; ".join(reply["symptoms"]))
    if reply["condition"]:
        lines.append(f"{labels['condition']}: {reply['condition']}")
    if reply["possible_causes"]:
        lines.append(f"{labels['possible_causes']}: " + "; ".join(reply["possible_causes"]))
    if reply["quick_tips"]:
        lines.append(f"{labels['quick_tips']}: " + "; ".join(reply["quick_tips"]))
    level_text = labels["levels"][reply["emergency"]["level"]]
    lines.append(f"{labels['emergency']}: {level_text}. {reply['emergency']['reason']}".strip())
    if reply["follow_up_question"]:
        lines.append(reply["follow_up_question"])
    return "\n".join(lines).replace("**", "")


def get_history(conversation_id: str):
    with db.connect() as conn:
        rows = conn.execute("SELECT role, content FROM messages WHERE conversation_id=? ORDER BY id", (conversation_id,)).fetchall()
    # Messages are already oldest to newest, so keep that order for the model.
    canned = {no_data_message("english"), no_data_message("urdu"), no_data_message("roman"), NO_REPLY_MESSAGE, MODEL_DOWN_MESSAGE}
    history = []
    for row in rows:
        # Skip our own "no data" style replies so the model does not copy them.
        if row["role"] == "assistant" and row["content"] in canned:
            continue
        history.append({"role": row["role"], "content": row["content"]})
    return history


@router.get("/health")
async def health():
    return {"status": "ok", "models": await connectivity()}


@router.post("/chat/sessions", dependencies=[Depends(require_scope("chat:write"))])
def create_session(payload: NewConversation):
    conversation_id = str(uuid.uuid4())
    with db.connect() as conn:
        conn.execute("INSERT INTO conversations(id, patient_id, title) VALUES (?, ?, ?)", (conversation_id, payload.patient_id, payload.title))
    return {"id": conversation_id, "patient_id": payload.patient_id, "title": payload.title, "messages": []}


@router.get("/chat/sessions", dependencies=[Depends(require_scope("chat:read"))])
def list_sessions(patient_id: str):
    with db.connect() as conn:
        rows = conn.execute("SELECT id, patient_id, title, created_at, updated_at FROM conversations WHERE patient_id=? ORDER BY updated_at DESC", (patient_id,)).fetchall()
    return [dict(row) for row in rows]


@router.get("/chat/sessions/{conversation_id}", dependencies=[Depends(require_scope("chat:read"))])
def get_session(conversation_id: str, patient_id: str):
    with db.connect() as conn:
        session = conn.execute("SELECT * FROM conversations WHERE id=? AND patient_id=?", (conversation_id, patient_id)).fetchone()
        if not session:
            raise HTTPException(404, "Conversation not found.")
        messages = conn.execute("SELECT role, content, structured, created_at FROM messages WHERE conversation_id=? ORDER BY id", (conversation_id,)).fetchall()
    return {**dict(session), "state": db.json_value(session["state"], {}), "messages": [{**dict(row), "structured": db.json_value(row["structured"], None)} for row in messages]}


@router.post("/chat/sessions/{conversation_id}/messages", dependencies=[Depends(require_scope("chat:write"))])
async def send_message(conversation_id: str, payload: MessageRequest, request: Request):
    started = time.perf_counter()
    with db.connect() as conn:
        session = conn.execute("SELECT * FROM conversations WHERE id=? AND patient_id=?", (conversation_id, payload.patient_id)).fetchone()
        if not session:
            raise HTTPException(404, "Conversation not found for this patient.")
        state = db.json_value(session["state"], {})
        conn.execute("INSERT INTO messages(conversation_id, role, content) VALUES (?, 'user', ?)", (conversation_id, payload.message.strip()))

    user_text = payload.message.strip()
    lowered = user_text.lower().strip(" .!?")
    language = language_of(user_text)
    result = {"provider": "data", "model": "", "usage": {}}
    structured = None  # filled only when the model gives a structured medical reply
    affirmative = lowered in {"yes", "confirm", "confirm booking", "book it", "جی", "ہاں", "haan", "han", "yes please"} or bool(re.fullmatch(r"(yes|haan|han|جی|ہاں)(\s+please)?(\s+book( it| karo| kar do| kar dein| kar dain))?", lowered))
    if affirmative and state.get("pending_booking", {}).get("language"):
        language = state["pending_booking"]["language"]
    if state.get("pending_booking") and affirmative:
        proposal = state.pop("pending_booking")
        appointment_id = str(uuid.uuid4())
        try:
            with db.connect() as conn:
                conn.execute("INSERT INTO appointments(id, patient_id, doctor_id, slot) VALUES (?, ?, ?, ?)", (appointment_id, payload.patient_id, proposal["doctor_id"], proposal["slot"]))
            if language == "urdu":
                answer = f"آپ کی اپائنٹمنٹ {proposal['doctor']} کے ساتھ {proposal['hospital']} میں {proposal['slot']} کے لیے بک ہو گئی ہے۔ حوالہ: {appointment_id[:8]}"
            elif language == "roman":
                answer = f"Aap ki appointment {proposal['doctor']} ke saath {proposal['hospital']} mein {proposal['slot']} ke liye book ho gayi hai. Reference: {appointment_id[:8]}"
            else:
                answer = f"Your appointment is booked with {proposal['doctor']} at {proposal['hospital']} for {proposal['slot']}. Reference: {appointment_id[:8]}"
        except Exception:
            answer = "یہ وقت اب دستیاب نہیں۔" if language == "urdu" else "Yeh waqt ab available nahi." if language == "roman" else "That slot is no longer available. Please ask me to check the schedule again."
    elif state.get("pending_booking") and lowered in {"no", "cancel", "no thanks", "نہیں", "nahin"}:
        state.pop("pending_booking", None)
        answer = "ٹھیک ہے، اپائنٹمنٹ بک نہیں کی گئی۔" if language == "urdu" else "Theek hai, appointment book nahi ki." if language == "roman" else "Okay, I haven't booked the appointment."
    elif no_data_for(user_text):
        patient_record_question = has_term(lowered, PATIENT_RECORD_TERMS)
        doctor_question = not patient_record_question and (
            has_term(lowered, APPOINTMENT_TERMS + AVAILABILITY_TERMS)
            or (has_term(lowered, DOCTOR_WORDS) and has_term(lowered, DOCTOR_LOOKUP_WORDS))
        )
        needs_clarification = False
        if doctor_question:
            if any(re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", lowered) for phrase in ("this doctor", "that doctor", "is he available", "is she available", "yeh doctor", "wo doctor", "یہ ڈاکٹر", "وہ ڈاکٹر")):
                answer = "آپ کس ڈاکٹر کے بارے میں پوچھ رہے ہیں؟ براہِ کرم ڈاکٹر کا نام بتائیں۔" if language == "urdu" else "Aap kis doctor ke bare mein pooch rahe hain? Doctor ka naam bata dein." if language == "roman" else "Which doctor do you mean? Please share the doctor's name."
                doctors = []
                needs_clarification = True
            else:
                doctors = doctor_matches(user_text)
            if doctors:
                requested_book = has_term(lowered, ("book", "appointment", "schedule", "اپائنٹمنٹ"))
                doctor = doctors[0]
                if requested_book and doctor["availability"]:
                    slot = doctor["availability"][0]
                    state["pending_booking"] = {"doctor_id": doctor["id"], "doctor": doctor["name"], "hospital": doctor["hospital"], "slot": slot, "language": language}
                    if language == "urdu":
                        answer = f"{doctor['name']} ({doctor['specialty']})، {doctor['hospital']} میں {slot} کے وقت دستیاب ہیں۔ کیا آپ یہ وقت بک کرنا چاہتے ہیں؟ براہِ کرم تصدیق کریں۔"
                    elif language == "roman":
                        answer = f"{doctor['name']} ({doctor['specialty']}), {doctor['hospital']} mein {slot} par available hain. Kya aap yeh waqt book karna chahte hain? Barah-e-karam confirm karein."
                    else:
                        answer = f"{doctor['name']} ({doctor['specialty']}) at {doctor['hospital']} has {slot} available. Would you like me to book this slot? Please confirm."
                else:
                    answer = doctor_list(doctors, language)
            else:
                if not needs_clarification:
                    answer = no_data_message(language)
        else:
            facts = find_patient_facts(payload.patient_id, user_text)
            if facts:
                evidence = "\n".join(f"{fact['category']}: {fact['content']}" for fact in facts)
                try:
                    result = await chat([{"role": "system", "content": f"Answer the patient's question only from these verified records. Use the same language and writing style as the patient. If the records do not answer it, state that clearly. Do not add instructions, dates, medicines, or interpretations not present in the records.\n\nVerified records:\n{evidence}"}, {"role": "user", "content": user_text}])
                    answer = result["text"]
                except Exception:
                    answer = evidence
            else:
                answer = no_data_message(language)
    else:
        previous = get_history(conversation_id)
        facts = find_patient_facts(payload.patient_id, user_text)
        evidence = "\n".join(f"{item['category']}: {item['content']}" for item in facts) or "No patient-specific source records found."
        language_note = {"role": "system", "content": f"The patient's latest message is in {LANGUAGE_NAMES[language]}. Write every text value only in that language and script. Return JSON only."}
        messages = [{"role": "system", "content": REPLY_SYSTEM_PROMPT}, {"role": "system", "content": f"Verified records for this patient (use only when relevant):\n{evidence}"}, *previous, language_note]
        try:
            model_task = asyncio.create_task(chat(messages, max_tokens=2000, json_mode=True))
            while not model_task.done():
                done, _ = await asyncio.wait({model_task}, timeout=0.15)
                if not done and await request.is_disconnected():
                    model_task.cancel()
                    return Response(status_code=499)
            result = await model_task
            raw_text = (result["text"] or "").strip()
            structured = parse_structured_reply(raw_text) if raw_text else None
            if structured:
                answer = structured_to_text(structured, language)
            else:
                # The model did not return usable JSON, so show its text as it is.
                answer = raw_text or NO_REPLY_MESSAGE
        except Exception:
            answer = MODEL_DOWN_MESSAGE
            result = {"provider": "none", "model": "none", "usage": {}}
    with db.connect() as conn:
        conn.execute("INSERT INTO messages(conversation_id, role, content, structured) VALUES (?, 'assistant', ?, ?)", (conversation_id, answer, json.dumps(structured) if structured else None))
        conn.execute("UPDATE conversations SET state=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (json.dumps(state), conversation_id))
        conn.execute("UPDATE conversations SET title=? WHERE id=? AND title='New conversation'", (user_text[:60], conversation_id))
    return {"answer": answer, "structured": structured, "language": language, "response_time_ms": round((time.perf_counter() - started) * 1000), "usage": result.get("usage", {}), "provider": result.get("provider", "data"), "model": result.get("model", ""), "fallback_used": result.get("provider") == "ollama"}


@router.post("/integrations/patient-records", dependencies=[Depends(require_scope("records:write"))])
def add_patient_record(payload: PatientRecord):
    with db.connect() as conn:
        cursor = conn.execute("INSERT INTO patient_records(patient_id, category, content, metadata) VALUES (?, ?, ?, ?)", (payload.patient_id, payload.category, payload.content, json.dumps(payload.metadata)))
    return {"id": cursor.lastrowid, "status": "stored"}


@router.post("/integrations/doctors", dependencies=[Depends(require_scope("doctors:write"))])
def upsert_doctor(payload: DoctorRecord):
    with db.connect() as conn:
        conn.execute("INSERT INTO doctors(id, name, specialty, hospital, availability) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, specialty=excluded.specialty, hospital=excluded.hospital, availability=excluded.availability", (payload.id, payload.name, payload.specialty, payload.hospital, json.dumps(payload.availability)))
    return {"id": payload.id, "status": "stored"}


@router.post("/summaries", dependencies=[Depends(require_scope("summarizer:write"))])
async def summarize(patient_id: str = Form(default=""), file: UploadFile = File(...)):
    content = await file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(content) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {settings.MAX_UPLOAD_MB} MB limit.")
    name = file.filename or "uploaded-record"
    try:
        if name.lower().endswith(".pdf"):
            import io
            source = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(content)).pages)
        else:
            source = content.decode("utf-8")
    except Exception as exc:
        raise HTTPException(422, "The file could not be read. Use a text-based PDF or UTF-8 text file.") from exc
    if not source.strip():
        raise HTTPException(422, "No readable text was found in the uploaded file.")
    instruction = "Summarize only facts explicitly present in the source. Never infer missing facts. Return only a JSON object with exactly these ten string fields: " + ", ".join(SUMMARY_FIELDS) + ". For any field without documented information, use 'Not documented in the provided records'. Keep clinically relevant dates and units."
    try:
        result = await chat([{"role": "system", "content": instruction}, {"role": "user", "content": f"Source document ({name}):\n{source[:60000]}"}], max_tokens=1500, json_mode=True)
        raw = result["text"].strip().removeprefix("```json").removesuffix("```").strip()
        fields = json.loads(raw)
        if not isinstance(fields, dict):
            raise ValueError("Summary must be a JSON object.")
        fields = {key: str(fields.get(key, "Not documented in the provided records")) for key in SUMMARY_FIELDS}
    except Exception as exc:
        raise HTTPException(503, "Could not create a validated summary. Check model connectivity and try again.") from exc
    summary_id = str(uuid.uuid4())
    with db.connect() as conn:
        conn.execute("INSERT INTO summaries(id, patient_id, fields, source_name) VALUES (?, ?, ?, ?)", (summary_id, patient_id, json.dumps(fields), name))
    return {"id": summary_id, "patient_id": patient_id, "source_name": name, "fields": fields, "usage": result.get("usage", {}), "provider": result.get("provider"), "model": result.get("model")}


@router.get("/summaries/{summary_id}", dependencies=[Depends(require_scope("summarizer:read"))])
def get_summary(summary_id: str):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM summaries WHERE id=?", (summary_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Summary not found.")
    return {**dict(row), "fields": db.json_value(row["fields"], {})}