from __future__ import annotations

import json
import asyncio
import logging
import re
import time
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pypdf import PdfReader

from app import db
from app.core import settings
from app import portal_flow
from app.hospital_connector import KARACHI, HospitalConnector
from app.llm import chat, connectivity
from app.security import require_scope
from app.summarizer.pipeline import markdown_hash, summarize_records
from app.summarizer.sources import CityHospitalSource

router = APIRouter(prefix="/api/v1")
logger = logging.getLogger(__name__)
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
    provider: str = Field(default="groq", pattern="^(groq|ollama)$")
    groq_model: str | None = Field(default=None, max_length=160)
    ollama_model: str | None = Field(default=None, max_length=160)
    auto_fallback: bool = True
    # NEW: text of the assistant message this one replies to (the faded "replying to" chip).
    reply_to: str | None = Field(default=None, max_length=300)
    # NEW (step 4): set by the CityHospital portal only. True = the chat page can hand a confirmed booking to the portal.
    portal_bridge: bool = False


class ActionResult(BaseModel):
    """NEW (step 4): what the portal page reports after it carried out a booking / reschedule / cancel request."""
    patient_id: str = Field(min_length=1, max_length=128)
    action_id: str = Field(min_length=1, max_length=64)
    ok: bool
    data: dict | None = None            # the portal's own appointment record when ok
    code: str | None = Field(default=None, max_length=64)   # the portal's error code when not ok


class EvaluationRequest(BaseModel):
    query: str = Field(min_length=1, max_length=settings.MAX_MESSAGE_CHARS)
    language: str = Field(pattern="^(en|ur)$")
    category: str = Field(pattern="^(triage|diseaseDetection|doctorInfo|appointment|hospitalInfo)$")
    provider: str = Field(pattern="^(groq|ollama)$")
    model: str = Field(min_length=1, max_length=160)
    labels: list[str] = Field(default_factory=list, max_length=200)


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


# NEW: common Roman Urdu words. Words that are also normal English words (main, me, do, to, or, the) are left out on purpose.
ROMAN_WORDS = frozenset(
    "kya hai hain hoon tha thi ka ki ke ko ky mera meri mere mujhe mujh humein aap aapko aapki aapka tum tumhe woh wo yeh ye "
    "dawa dawai davai batao bataiye batayen karna karo karein karen kar kiya kijiye chahiye chahta chahti chahte milega mili milta "
    "karwao karwana beti beta bachi bacha bhai behan ammi abbu bukhar dard sar seene seena kaan gala naak aankh aankhon khansi zukam "
    "ulti chakkar thakan kamzori pyas nahi nahin nai kuch kuchh mein se par pe bhi aur lekin magar ya agar jab tab kal aaj raat subah shaam "
    "din hafta haftay mahina saal thora thori zyada bohat bahut buhat bilkul abhi phir wapas waqt sahab sahib kaisa kaise kyun kyu "
    "kab kahan kaun kitna kitni lag lagta lagti lagi rahi raha rahe hota hoti hui hua gaya gayi gaye aya aayi aaya dena dedo dein lena lein "
    "chal chalta sakta sakti sakte sakta jaana jana jaye jayen rehta rehti khana khane peena peeta peeti sona sota soti uthna uthta "
    "mehsoos tabiyat tabiat theek thik achha acha bura mushkil takleef pareshani ilaaj dikhana dikhayen wala wali walay mil milna "
    "kiye kisi kis apna apni apne unka unki uska uski hamari hamara mujhay mjhe".split()
)


def language_counts(text: str) -> tuple[int, int, int]:
    """Words in Urdu script, words in Latin letters, and how many of those Latin words are Roman Urdu."""
    words = re.findall(r"[A-Za-z\u0600-\u06ff']+", text)
    urdu = [word for word in words if re.search(r"[\u0600-\u06ff]", word)]
    latin = [word.lower().strip("'") for word in words if not re.search(r"[\u0600-\u06ff]", word)]
    return len(urdu), len(latin), sum(1 for word in latin if word in ROMAN_WORDS)


def language_of(text: str) -> str:
    """Language of one message by word counts. A mixed message gets whichever style has more words."""
    urdu, latin, roman = language_counts(text)
    if urdu and urdu >= latin:
        return "urdu"
    if roman and (latin <= 3 or roman / latin >= 0.34):
        return "roman"
    return "english"


def language_is_unclear(text: str) -> bool:
    """True when the word counts do not clearly say which style dominates, so the model should decide."""
    urdu, latin, roman = language_counts(text)
    if urdu and latin:
        return abs(urdu - latin) <= max(1, (urdu + latin) // 4)
    if latin > 3 and roman:
        return 0.15 <= roman / latin < 0.6
    return False


async def detect_language(text: str, **model_options) -> str:
    """Rules first (free and instant). Only a message that is really mixed is sent to the model, and any model failure falls back to the rules."""
    guess = language_of(text)
    if not language_is_unclear(text):
        return guess
    prompt = (
        "Decide which writing style DOMINATES the patient's message. Answer with one JSON object only: {\"language\": \"english\" | \"urdu\" | \"roman\"}. "
        "english = English words; urdu = Urdu in Urdu script; roman = Urdu written in English letters (for example 'mujhe bukhar hai'). "
        "If the message mixes styles, choose the style that has the most words."
    )
    try:
        result = await chat([{"role": "system", "content": prompt}, {"role": "user", "content": text[:1000]}], max_tokens=30, json_mode=True, **model_options)
        raw = (result["text"] or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        value = json.loads(raw).get("language")
        return value if value in LANGUAGE_NAMES else guess
    except Exception:
        return guess


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


# ---------------------------------------------------------------- step 3: hospital connector (read-only)
connector = HospitalConnector()   # tests replace this
HOSPITAL_INFO_TERMS = (
    "visiting hours", "opening hours", "open hours", "hours", "timing", "timings", "open", "closed", "address", "location", "where is the hospital",
    "phone number", "contact", "emergency number", "helpline", "email", "tel", "number",
    "اوقات", "ٹائمنگ", "پتہ", "ایڈریس", "فون", "رابطہ", "نمبر", "کھلا", "کب کھلتا",
    "kahan hai", "kab khulta", "kitne baje", "pata", "raabta",
)
CLARIFY_DOCTOR_PHRASES = ("this doctor", "that doctor", "is he available", "is she available", "yeh doctor", "wo doctor", "یہ ڈاکٹر", "وہ ڈاکٹر")
# Words that do not name a doctor, a specialty or a department.
GENERIC_WORDS = frozenset(
    "book appointment appointments slot slots doctor doctors dr available availability find show specialist need want please hello with for the any see can you who which when next "
    "morning evening afternoon tomorrow today monday tuesday wednesday thursday friday saturday sunday visit check there have has are not and from that this some "
    "kal aaj subah shaam dopahar chahiye karna karo karwao mujhe hai hain ke ki ko ka mein se par".split()
)
WEEKDAYS = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}


def connector_intent_by_rules(text: str) -> str | None:
    lowered = text.lower().strip(" .!?")
    if has_term(lowered, SYMPTOM_TERMS) and not (has_term(lowered, APPOINTMENT_TERMS) or has_term(lowered, AVAILABILITY_TERMS)):
        return None
    if has_term(lowered, PATIENT_RECORD_TERMS):
        return None
    if any(re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", lowered) for phrase in CLARIFY_DOCTOR_PHRASES):
        return None
    if has_term(lowered, APPOINTMENT_TERMS + AVAILABILITY_TERMS) or (has_term(lowered, DOCTOR_WORDS) and has_term(lowered, DOCTOR_LOOKUP_WORDS)):
        return "doctor_lookup"
    if has_term(lowered, HOSPITAL_INFO_TERMS):
        return "hospital_info"
    return None


async def classify_intent(text: str, **model_options) -> str:
    """Model fallback for a message the word rules cannot place. Returns hospital_info, doctor_lookup or other."""
    prompt = (
        "Classify the patient's message. Answer with one JSON object only: {\"intent\": \"hospital_info\" | \"doctor_lookup\" | \"other\"}. "
        "hospital_info = asks about the hospital itself (opening hours, address, phone, location). "
        "doctor_lookup = asks to find a doctor or specialist, see doctor availability or free appointment times. "
        "other = anything else, including symptoms, greetings and questions about their own records."
    )
    try:
        result = await chat([{"role": "system", "content": prompt}, {"role": "user", "content": text[:1000]}], max_tokens=30, json_mode=True, **model_options)
        raw = (result["text"] or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        value = json.loads(raw).get("intent")
        return value if value in ("hospital_info", "doctor_lookup") else "other"
    except Exception:
        return "other"


def requested_day(text: str, today):
    lowered = text.lower()
    if has_term(lowered, ("tomorrow", "kal", "کل")):
        return today + timedelta(days=1)
    if has_term(lowered, ("today", "aaj", "آج")):
        return today
    for name, index in WEEKDAYS.items():
        if has_term(lowered, (name,)):
            return today + timedelta(days=(index - today.weekday()) % 7)
    return None


def pick_doctors(text: str, doctors: list[dict]) -> list[dict]:
    """Doctors named in the message (by name, specialty or department). With no specific word, the first three."""
    terms = [word for word in re.findall(r"[\w\u0600-\u06ff]+", text.lower()) if len(word) > 2 and word not in GENERIC_WORDS]
    if not terms:
        return doctors[:3]
    matches = []
    for doctor in doctors:
        source = f"{doctor['name']} {doctor['specialty']} {doctor['department']}".lower()
        if any(term[:5] in source for term in terms):
            matches.append(doctor)
    return matches[:3]


CONNECTOR_TEXT = {
    "english": {"doctors": "Available doctors and slots:", "none": "no free slot in the next 30 days", "hospital": "Hospital information:", "address": "Address", "phone": "Phone", "emergency": "Emergency", "hours": "Hours", "email": "Email"},
    "urdu": {"doctors": "دستیاب ڈاکٹر اور اوقات:", "none": "اگلے 30 دن میں کوئی وقت خالی نہیں", "hospital": "ہسپتال کی معلومات:", "address": "پتہ", "phone": "فون", "emergency": "ایمرجنسی", "hours": "اوقات", "email": "ای میل"},
    "roman": {"doctors": "Available doctors aur slots:", "none": "agle 30 din mein koi waqt khali nahi", "hospital": "Hospital ki maloomat:", "address": "Pata", "phone": "Phone", "emergency": "Emergency", "hours": "Auqaat", "email": "Email"},
}


def build_connector_reply(kind: str, language: str, hospital: dict | None, doctor_cards: list[dict] | None):
    words = CONNECTOR_TEXT[language]
    if kind == "hospital_info":
        lines = [words["hospital"], f"• {hospital['name']}"] + [f"• {words[key]}: {hospital[field]}" for key, field in (("address", "address"), ("phone", "phone"), ("emergency", "emergency_number"), ("hours", "open_hours"), ("email", "email")) if hospital.get(field)]
        return "\n".join(lines), {"type": "hospital", "hospital": hospital}
    lines = [words["doctors"]]
    for card in doctor_cards:
        slots = f"{card['date']}: {', '.join(card['slots'])}" if card["slots"] else words["none"]
        lines.append(f"• {card['name']} — {card['specialty'] or card['department']}; {slots}")
    return "\n".join(lines), {"type": "doctors", "doctors": doctor_cards, "booking_enabled": False}


async def connector_reply(user_text: str, language: str, patient_id: str, model_options: dict):
    """(answer, structured) from the hospital database, or None to use the existing flow (not configured, nothing found, any error)."""
    if not connector.configured:
        return None
    try:
        intent = connector_intent_by_rules(user_text)
        lowered = user_text.lower()
        if intent is None and len(lowered.strip()) > 3 and not has_term(lowered, SYMPTOM_TERMS) and not has_term(lowered, PATIENT_RECORD_TERMS):
            intent = await classify_intent(user_text, **model_options)
        if intent == "hospital_info":
            hospital = await asyncio.to_thread(connector.hospital)
            return build_connector_reply("hospital_info", language, hospital, None) if hospital else None
        if intent != "doctor_lookup":
            return None
        doctors = await asyncio.to_thread(connector.doctors)
        chosen = pick_doctors(user_text, doctors)
        if not chosen:
            return None
        today = connector.now().astimezone(KARACHI).date()
        wanted = requested_day(user_text, today)
        patient = int(patient_id) if str(patient_id).isdigit() else None
        cards = []
        for doctor in chosen:
            if wanted:
                found = {"date": wanted.isoformat(), "slots": await asyncio.to_thread(connector.slots, doctor["id"], wanted, patient)}
            else:
                found = await asyncio.to_thread(connector.next_slots, doctor["id"], patient) or {"date": "", "slots": []}
            cards.append({**doctor, "date": found["date"], "slots": [slot["time"] for slot in found["slots"]][:6], "room": found["slots"][0]["room_label"] if found["slots"] else ""})
        return build_connector_reply("doctor_lookup", language, None, cards)
    except Exception:
        logger.exception("Hospital connector failed; using the built-in flow")
        return None


REPLY_SYSTEM_PROMPT = """You are a cautious medical information assistant for a hospital. Reply with ONE JSON object only, no other text.

Use this exact JSON shape:
{
  "type": "medical" or "message",
  "message": "short text, only when type is message",
  "symptoms": ["short symptom", "..."],
  "condition": "one short sentence describing the patient's situation",
  "possible_causes": [{"name": "possible cause", "percent": 58}, {"name": "...", "percent": 24}],
  "quick_tips": ["short precaution or tip", "..."],
  "emergency": {"level": "emergency" or "see_doctor_soon" or "not_emergency", "reason": "one short sentence"},
  "follow_up_question": "one short question, or empty string"
}

Rules:
- Use type "medical" when the patient describes symptoms or asks a medical question. Fill the sections that apply and use [] or "" for the rest.
- Use type "message" for greetings, nonsense, silly text, or off-topic questions. Put a short, calm, polite reply in "message" and invite the patient to ask a medical or appointment question. Do not answer off-topic requests. Leave the other fields empty.
- Keep everything SHORT. Maximum 5 symptoms, 3 possible causes, 4 quick tips. Each item is a few words, not a full paragraph.
- Wrap the most important words in each item with **double asterisks**, for example "**stay hydrated** with small sips". Use at most one or two highlighted phrases per item.
- possible_causes are only possibilities, never a diagnosis. Each has a short "name" and a "percent" (whole number): your rough estimate of how likely that cause is among the listed ones, most likely first. The percents must add up to 100 or less. Never name a specific medicine dose.
- Never write phone numbers or emergency numbers; the app adds them. In emergency.reason just say to call for help if it gets worse.
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


def clean_causes(value, limit=3):
    """Possible causes as [{"name", "percent"}]. Plain strings (older replies) get percent None. Percents are clamped and scaled so they never add up to more than 100."""
    if not isinstance(value, list):
        return []
    causes = []
    for item in value:
        if isinstance(item, dict):
            name = str(item.get("name", "")).strip()[:200]
            try:
                percent = max(0, min(100, round(float(item.get("percent")))))
            except (TypeError, ValueError):
                percent = None
        else:
            name, percent = str(item).strip()[:200], None
        if name:
            causes.append({"name": name, "percent": percent})
    causes = causes[:limit]
    total = sum(item["percent"] or 0 for item in causes)
    if total > 100:
        for item in causes:
            if item["percent"] is not None:
                item["percent"] = round(item["percent"] * 100 / total)
    return causes


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
        "possible_causes": clean_causes(data.get("possible_causes")),
        "quick_tips": clean_list(data.get("quick_tips"), 4),
        "emergency": {"level": level, "reason": str(emergency.get("reason", "")).strip()[:300]},
        "follow_up_question": str(data.get("follow_up_question", "")).strip()[:300],
    }
    # A medical reply with nothing in it is not useful.
    if not (reply["symptoms"] or reply["condition"] or reply["possible_causes"] or reply["quick_tips"]):
        return None
    return reply


def cause_text(item) -> str:
    """One cause for the plain-text version; also accepts the older plain-string form."""
    if isinstance(item, dict):
        return f"{item['name']} ({item['percent']}%)" if item.get("percent") is not None else item["name"]
    return str(item)


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
        lines.append(f"{labels['possible_causes']}: " + "; ".join(cause_text(item) for item in reply["possible_causes"]))
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


@router.post("/evaluation/respond", dependencies=[Depends(require_scope("chat:write"))])
async def evaluation_response(payload: EvaluationRequest):
    """Generate a label prediction with a model-reported confidence distribution."""
    category_instructions = {
        "triage": "Return the most appropriate hospital department for the described symptoms.",
        "diseaseDetection": "Return the most likely disease or condition label from the symptoms.",
        "doctorInfo": "Return the matching doctor specialty or information label.",
        "appointment": "Return the appointment intent label (Book appointment, Cancel appointment, Reschedule appointment, Check availability, or View appointments).",
        "hospitalInfo": "Return the hospital information topic label.",
    }
    language_name = "Urdu" if payload.language == "ur" else "English"
    prompt = (
        "You are answering one item from a hospital research benchmark. "
        f"The question is written in {language_name}. {category_instructions[payload.category]} "
        f"Choose labels only from this category's benchmark labels: {json.dumps(payload.labels, ensure_ascii=False)}. "
        "Return a JSON object with this exact shape: {\"answer\": string, \"confidence\": number, "
        "\"candidates\": [{\"label\": string, \"confidence\": number}], \"explanation\": string}. "
        "The answer must be the single best label exactly as listed. Include up to three plausible candidate labels, "
        "ranked from most to least likely, with each confidence as a number from 0 to 1 (for example 0.75 means 75%). "
        "The first candidate must match answer. Confidence values are your estimates and should reflect uncertainty; "
        "do not present them as clinically calibrated probabilities. Give a brief evidence summary, not hidden chain-of-thought. "
        "Return only valid JSON."
    )
    messages = [{"role": "system", "content": prompt}, {"role": "user", "content": payload.query}]
    for attempt in range(2):
        try:
            result = await chat(
                messages,
                max_tokens=512,
                json_mode=True,
                provider=payload.provider,
                groq_model=payload.model if payload.provider == "groq" else None,
                ollama_model=payload.model if payload.provider == "ollama" else None,
                auto_fallback=False,
                no_timeout=True,
            )
        except Exception as exc:
            logger.exception("Evaluation generation failed for provider=%s model=%s", payload.provider, payload.model)
            raise HTTPException(503, f"The selected model request failed ({type(exc).__name__}).") from exc
        model_response = (result.get("text") or "").strip()
        if model_response:
            try:
                parsed = json.loads(model_response)
            except (json.JSONDecodeError, TypeError):
                parsed = {}
            answer = str(parsed.get("answer") or "").strip() if isinstance(parsed, dict) else ""
            candidates = parsed.get("candidates", []) if isinstance(parsed, dict) else []
            confidence_candidates = []
            if isinstance(candidates, list):
                for candidate in candidates[:3]:
                    if not isinstance(candidate, dict) or not str(candidate.get("label", "")).strip():
                        continue
                    try:
                        confidence = float(candidate.get("confidence"))
                    except (TypeError, ValueError):
                        continue
                    confidence = confidence * 100 if 0 <= confidence <= 1 else confidence
                    if 0 <= confidence <= 100:
                        confidence_candidates.append({"label": str(candidate["label"]).strip(), "confidence": round(confidence, 1)})
            try:
                confidence = float(parsed.get("confidence")) if isinstance(parsed, dict) else None
            except (TypeError, ValueError):
                confidence = None
            if confidence is not None and 0 <= confidence <= 1:
                confidence *= 100
            if confidence is None or not 0 <= confidence <= 100:
                confidence = next((entry["confidence"] for entry in confidence_candidates if entry["label"] == answer), None)
            if not answer:
                answer = confidence_candidates[0]["label"] if confidence_candidates else model_response
            if answer:
                return {"answer": answer, "model_response": model_response,
                    "explanation": str(parsed.get("explanation") or "").strip() if isinstance(parsed, dict) else "",
                    "confidence": round(confidence, 1) if confidence is not None else None,
                    "confidence_candidates": confidence_candidates,
                    "provider": result.get("provider"), "model": result.get("model"),
                    "finish_reason": result.get("finish_reason"), "usage": result.get("usage", {})}
        logger.warning("Evaluation model returned empty content; retry=%s provider=%s model=%s", attempt + 1, payload.provider, payload.model)
    raise HTTPException(502, "The selected model returned an empty answer twice. The query was not recorded as completed.")


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
        messages = conn.execute("SELECT role, content, structured, reply_to, created_at FROM messages WHERE conversation_id=? ORDER BY id", (conversation_id,)).fetchall()
    return {**dict(session), "state": db.json_value(session["state"], {}), "messages": [{**dict(row), "structured": db.json_value(row["structured"], None)} for row in messages]}


@router.post("/chat/sessions/{conversation_id}/messages", dependencies=[Depends(require_scope("chat:write"))])
async def send_message(conversation_id: str, payload: MessageRequest, request: Request):
    started = time.perf_counter()
    with db.connect() as conn:
        session = conn.execute("SELECT * FROM conversations WHERE id=? AND patient_id=?", (conversation_id, payload.patient_id)).fetchone()
        if not session:
            raise HTTPException(404, "Conversation not found for this patient.")
        state = db.json_value(session["state"], {})
        reply_to = (payload.reply_to or "").strip() or None
        conn.execute("INSERT INTO messages(conversation_id, role, content, reply_to) VALUES (?, 'user', ?, ?)", (conversation_id, payload.message.strip(), reply_to))

    user_text = payload.message.strip()
    lowered = user_text.lower().strip(" .!?")
    language = await detect_language(user_text, provider=payload.provider, groq_model=payload.groq_model, ollama_model=payload.ollama_model, auto_fallback=payload.auto_fallback)
    result = {"provider": "data", "model": "", "usage": {}}
    structured = None  # filled only when the model gives a structured medical reply
    affirmative = lowered in {"yes", "confirm", "confirm booking", "book it", "جی", "ہاں", "haan", "han", "yes please"} or bool(re.fullmatch(r"(yes|haan|han|جی|ہاں)(\s+please)?(\s+book( it| karo| kar do| kar dein| kar dain))?", lowered))
    if affirmative and state.get("pending_booking", {}).get("language"):
        language = state["pending_booking"]["language"]
    model_options = {"provider": payload.provider, "groq_model": payload.groq_model, "ollama_model": payload.ollama_model, "auto_fallback": payload.auto_fallback}
    pending_reply = bool(state.get("pending_booking")) and (affirmative or lowered in {"no", "cancel", "no thanks", "نہیں", "nahin"})
    # NEW (step 4): with the hospital connection on and the portal bridge present, bookings go through the portal (see portal_flow.py).
    portal_on = bool(payload.portal_bridge and connector.configured)
    flow_reply = None
    if portal_on:
        try:
            flow_reply = await portal_flow.handle(user_text, language, payload.patient_id, state, connector)
        except Exception:
            logger.exception("Portal booking flow failed; using the normal flow")
    if flow_reply is not None:
        answer, structured, language = flow_reply
        hospital_reply = (answer, structured)
    else:
        hospital_reply = None if pending_reply else await connector_reply(user_text, language, payload.patient_id, model_options)
    if hospital_reply is not None:
        answer, structured = hospital_reply
        if structured and structured.get("type") == "doctors":
            structured["booking_enabled"] = portal_on
        result = {"provider": "hospital", "model": "", "usage": {}}
    elif state.get("pending_booking") and affirmative:
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
                if requested_book and doctor["availability"] and not portal_on:   # NEW: no local test booking while the portal handles real ones
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
                    result = await chat([{"role": "system", "content": f"Answer the patient's question only from these verified records. Use the same language and writing style as the patient. If the records do not answer it, state that clearly. Do not add instructions, dates, medicines, or interpretations not present in the records.\n\nVerified records:\n{evidence}"}, {"role": "user", "content": user_text}], provider=payload.provider, groq_model=payload.groq_model, ollama_model=payload.ollama_model, auto_fallback=payload.auto_fallback)
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
        if reply_to:
            # The patient chose to answer one specific earlier message; tell the model which one.
            messages.append({"role": "system", "content": f"The patient's latest message is a direct reply to this earlier assistant message: {reply_to}"})
        try:
            model_task = asyncio.create_task(chat(messages, max_tokens=2000, json_mode=True, provider=payload.provider, groq_model=payload.groq_model, ollama_model=payload.ollama_model, auto_fallback=payload.auto_fallback))
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
    return {"answer": answer, "structured": structured, "language": language, "response_time_ms": round((time.perf_counter() - started) * 1000), "usage": result.get("usage", {}), "provider": result.get("provider", "data"), "model": result.get("model", ""), "fallback_used": result.get("fallback_used", False), "fallback_reason": result.get("fallback_reason")}


@router.post("/chat/sessions/{conversation_id}/action-result", dependencies=[Depends(require_scope("chat:write"))])
async def action_result(conversation_id: str, payload: ActionResult):
    """NEW (step 4): store and word the outcome of a portal action. Only an action this conversation asked for can be answered, once."""
    with db.connect() as conn:
        session = conn.execute("SELECT * FROM conversations WHERE id=? AND patient_id=?", (conversation_id, payload.patient_id)).fetchone()
    if not session:
        raise HTTPException(404, "Conversation not found for this patient.")
    state = db.json_value(session["state"], {})
    outcome = await portal_flow.build_outcome(state, payload.action_id, payload.ok, payload.data, payload.code, connector, payload.patient_id)
    if outcome is None:
        raise HTTPException(409, "No waiting request with this id.")
    answer, structured, language = outcome
    with db.connect() as conn:
        conn.execute("INSERT INTO messages(conversation_id, role, content, structured) VALUES (?, 'assistant', ?, ?)", (conversation_id, answer, json.dumps(structured) if structured else None))
        conn.execute("UPDATE conversations SET state=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (json.dumps(state), conversation_id))
    return {"answer": answer, "structured": structured, "language": language}


@router.post("/integrations/patient-records", dependencies=[Depends(require_scope("records:write"))])
def add_patient_record(payload: PatientRecord):
    with db.connect() as conn:
        statement = "INSERT INTO patient_records(patient_id, category, content, metadata) VALUES (?, ?, ?, ?)"
        values = (payload.patient_id, payload.category, payload.content, json.dumps(payload.metadata))
        if getattr(conn, "is_postgres", False):
            cursor = conn.execute(f"{statement} RETURNING id", values)
            record_id = cursor.fetchone()["id"]
        else:
            cursor = conn.execute(statement, values)
            record_id = cursor.lastrowid
    return {"id": record_id, "status": "stored"}


@router.post("/integrations/doctors", dependencies=[Depends(require_scope("doctors:write"))])
def upsert_doctor(payload: DoctorRecord):
    with db.connect() as conn:
        conn.execute("INSERT INTO doctors(id, name, specialty, hospital, availability) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, specialty=excluded.specialty, hospital=excluded.hospital, availability=excluded.availability", (payload.id, payload.name, payload.specialty, payload.hospital, json.dumps(payload.availability)))
    return {"id": payload.id, "status": "stored"}


class SummaryDocument(BaseModel):
    name: str
    content_type: str = "text/plain"
    content_base64: str


class PatientSummaryRequest(BaseModel):
    patient_id: str
    doctor_id: str | None = None
    appointment_id: str | None = None
    documents: list[SummaryDocument] | None = None
    force: bool = False


async def _summary_response(patient_id, records, force=False, source_name="patient records"):
    from app.summarizer.markdown import records_to_markdown
    markdown, sources, warnings = records_to_markdown(records)
    digest = markdown_hash(markdown)
    if not force:
        with db.connect() as conn:
            old = conn.execute("SELECT * FROM summaries WHERE patient_id=? AND source_hash=? ORDER BY created_at DESC LIMIT 1", (patient_id, digest)).fetchone()
        if old:
            metadata = db.json_value(old["metadata"], {})
            return {"id": old["id"], "patient_id": patient_id, "fields": db.json_value(old["fields"], {}), "sources": metadata.get("sources", sources), "warnings": metadata.get("warnings", warnings), "truncated": metadata.get("truncated", False), "cached": True, "generated_at": old["created_at"], "provider": metadata.get("provider"), "model": metadata.get("model"), "usage": metadata.get("usage", {})}
    try:
        result = await summarize_records(records)
    except Exception as exc:
        logger.info("summary failed patient_id=%s size=%s", patient_id, len(markdown))
        raise HTTPException(503, "Could not create a validated summary. Check model connectivity and try again.") from exc
    summary_id = str(uuid.uuid4())
    metadata = {key: result[key] for key in ("sources", "warnings", "truncated", "provider", "model", "usage")}
    with db.connect() as conn:
        conn.execute("INSERT INTO summaries(id, patient_id, fields, source_name, source_hash, metadata) VALUES (?, ?, ?, ?, ?, ?)", (summary_id, patient_id, json.dumps(result["fields"]), source_name, digest, json.dumps(metadata)))
    return {"id": summary_id, "patient_id": patient_id, **metadata, "cached": False, "generated_at": result["generated_at"], "fields": result["fields"]}


@router.post("/summaries/by-patient", dependencies=[Depends(require_scope("summarizer:write"))])
async def summarize_by_patient(payload: PatientSummaryRequest):
    records = {"patient": {}, "appointments": [], "prescriptions": [], "reports": [], "files": [], "patient_records": [], "documents": [item.model_dump() for item in payload.documents or []]}
    if settings.RECORD_SOURCE == "cityhospital":
        records.update(CityHospitalSource().records(payload.patient_id, payload.doctor_id, payload.appointment_id))
        records["documents"] = [item.model_dump() for item in payload.documents or []]
    return await _summary_response(payload.patient_id, records, payload.force)


@router.post("/summaries", dependencies=[Depends(require_scope("summarizer:write"))])
async def summarize(patient_id: str = Form(default=""), file: UploadFile = File(...)):
    content = await file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(content) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {settings.MAX_UPLOAD_MB} MB limit.")
    import base64
    name = file.filename or "uploaded-record"
    result = await _summary_response(patient_id, {"documents": [{"name": name, "content_type": file.content_type or "application/octet-stream", "content_base64": base64.b64encode(content).decode()}]}, source_name=name)
    result["source_name"] = name
    return result


@router.get("/summaries/{summary_id}", dependencies=[Depends(require_scope("summarizer:read"))])
def get_summary(summary_id: str):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM summaries WHERE id=?", (summary_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Summary not found.")
    return {**dict(row), "fields": db.json_value(row["fields"], {})}
