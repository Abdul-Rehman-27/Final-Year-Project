"""Step 4: book / reschedule / cancel an appointment from the chat, through the CityHospital portal.

How it works (owner decision, 2026-11-28):
  * This module only TALKS: it finds the doctor / appointment, proposes the change in plain text and waits for the
    patient to type yes or no. It never writes to the hospital database.
  * After "yes" it returns a `portal_action` reply. The embedded chat page hands that request to the portal page
    (postMessage), the portal page calls its own authenticated patient endpoints (the portal knows who is signed in
    and applies every booking rule), and the page reports the outcome back to `/chat/sessions/{id}/action-result`.
  * The appointment details and the token in the final message come from the portal's answer, never from here.
The conversation state lives in `state["portal_flow"]` (current step) and `state["actions"]` (requests waiting for an outcome).
"""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import date, datetime, timedelta

from app.hospital_connector import KARACHI, MAX_ADVANCE_DAYS, HospitalConnector, as_utc

YES = {"yes", "y", "yep", "confirm", "ok", "okay", "sure", "book it", "yes please", "confirm booking", "haan", "han", "haan ji", "ji", "jee", "ji haan",
       "theek hai", "thik hai", "kar do", "kardo", "جی", "ہاں", "جی ہاں", "ٹھیک ہے", "ہاں جی"}
NO = {"no", "n", "nope", "cancel", "stop", "no thanks", "dont", "don't", "nahi", "nahin", "nahi chahiye", "rehne do", "رہنے دیں", "نہیں", "نہیں شکریہ", "روکیں"}
APPT_WORDS = ("appointment", "appointments", "apointment", "appoinment", "booking", "اپائنٹمنٹ", "اپوائنٹمنٹ")
CANCEL_WORDS = ("cancel", "cancellation", "منسوخ", "کینسل")
RESCHEDULE_WORDS = ("reschedule", "postpone", "change", "move", "edit", "modify", "badal", "tabdeel", "تبدیل", "بدل")
BOOK_WORDS = ("book", "appointment", "schedule", "slot", "اپائنٹمنٹ", "بک")
MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
WEEKDAYS = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
NOT_NAMES = frozenset(
    "book booking appointment appointments slot slots doctor doctors dr please want need would like with for the any see can you me my on at tomorrow today "
    "morning evening afternoon visit check there have has not and from that this some kal aaj chahiye karna karo karwao mujhe hai hain ke ki ko ka mein se par "
    "mon tue wed thu fri sat sun am pm first earliest available free time day date".split()
) | set(MONTHS) | set(WEEKDAYS) | {name[:3] for name in WEEKDAYS}
# The portal answers with a short code; show it next to a readable sentence.
ERROR_CODES = ("SLOT_UNAVAILABLE", "SLOT_IN_PAST", "TOO_FAR_AHEAD", "PATIENT_OVERLAP", "BOOKING_LIMIT_REACHED", "APPOINTMENT_LOCKED", "NOT_FOUND", "VALIDATION_ERROR", "NO_RESPONSE")

TEXT = {
    "english": {
        "when": "{date}, {time}", "doctor": "Doctor", "department": "Department", "date": "Date", "time": "Time", "room": "Room", "token": "Appointment token", "booking": "Booking no",
        "confirm_book": "I can book this appointment:", "confirm_tail": "Shall I book it? Reply yes to confirm or no to cancel.",
        "confirm_cancel": "Cancel your appointment with {doctor} on {when}? Reply yes to confirm or no to keep it.",
        "confirm_move": "Move your appointment with {doctor} from {old} to {new}? Reply yes to confirm or no to keep it.",
        "declined": "Okay, nothing was changed.", "reask": "Please reply yes or no.", "reask_pick": "Please reply with the number of the appointment.",
        "working_book": "One moment, I'm booking your appointment…", "working_cancel": "One moment, I'm cancelling your appointment…", "working_reschedule": "One moment, I'm moving your appointment…",
        "no_appts": "You have no upcoming appointments that can be changed.", "pick": "Which appointment do you mean? Reply with its number:",
        "ask_slot": "Moving your appointment with {doctor} ({when}). Which day and time would you like? For example: 2026-12-01 10:30. Free times are below.",
        "ask_time": "Here are the free times on {date}. Tell me which one you want.",
        "slot_taken": "{doctor} has no free slot at that time. The free times are below.", "none_found": "I couldn't find a free time for {doctor} in the next 30 days.",
        "ok_book": "Your appointment is booked.", "ok_reschedule": "Your appointment has been moved.", "ok_cancel": "Your appointment with {doctor} on {when} has been cancelled.",
        "failed": "The appointment was not changed. Reason: {reason}", "retry_slot": "Please choose another time.",
        "no_response": "I could not confirm the result. Please check “My appointments” before trying again, so you don't book twice.",
        "reasons": {"SLOT_UNAVAILABLE": "that time was just taken", "SLOT_IN_PAST": "that time has already passed", "TOO_FAR_AHEAD": "appointments can only be booked up to 30 days ahead",
                    "PATIENT_OVERLAP": "you already have an appointment at that time", "BOOKING_LIMIT_REACHED": "you already have the maximum of 3 upcoming appointments",
                    "APPOINTMENT_LOCKED": "this appointment can no longer be changed (you may already be checked in)", "NOT_FOUND": "the appointment or doctor was not found",
                    "VALIDATION_ERROR": "the request was not valid", "NO_RESPONSE": "no answer from the hospital system"},
        "reason_other": "the hospital system refused the request",
    },
    "urdu": {
        "when": "{date}، {time}", "doctor": "ڈاکٹر", "department": "شعبہ", "date": "تاریخ", "time": "وقت", "room": "کمرہ", "token": "اپائنٹمنٹ ٹوکن", "booking": "بکنگ نمبر",
        "confirm_book": "میں یہ اپائنٹمنٹ بک کر سکتا ہوں:", "confirm_tail": "کیا بک کر دوں؟ تصدیق کے لیے «جی» لکھیں یا منسوخ کرنے کے لیے «نہیں» لکھیں۔",
        "confirm_cancel": "کیا {doctor} کے ساتھ {when} کی اپائنٹمنٹ منسوخ کر دوں؟ تصدیق کے لیے «جی» لکھیں یا برقرار رکھنے کے لیے «نہیں» لکھیں۔",
        "confirm_move": "کیا {doctor} کے ساتھ اپائنٹمنٹ {old} سے {new} پر منتقل کر دوں؟ تصدیق کے لیے «جی» لکھیں یا برقرار رکھنے کے لیے «نہیں» لکھیں۔",
        "declined": "ٹھیک ہے، کوئی تبدیلی نہیں کی گئی۔", "reask": "براہِ کرم «جی» یا «نہیں» لکھیں۔", "reask_pick": "براہِ کرم اپائنٹمنٹ کا نمبر لکھیں۔",
        "working_book": "ایک لمحہ، آپ کی اپائنٹمنٹ بک کر رہا ہوں…", "working_cancel": "ایک لمحہ، آپ کی اپائنٹمنٹ منسوخ کر رہا ہوں…", "working_reschedule": "ایک لمحہ، آپ کی اپائنٹمنٹ منتقل کر رہا ہوں…",
        "no_appts": "آپ کی کوئی آنے والی اپائنٹمنٹ نہیں ہے جسے تبدیل کیا جا سکے۔", "pick": "آپ کون سی اپائنٹمنٹ کی بات کر رہے ہیں؟ اس کا نمبر لکھیں:",
        "ask_slot": "{doctor} کے ساتھ آپ کی اپائنٹمنٹ ({when}) منتقل کی جا رہی ہے۔ آپ کون سا دن اور وقت چاہتے ہیں؟ مثال: 2026-12-01 10:30۔ خالی اوقات نیچے ہیں۔",
        "ask_time": "{date} کے خالی اوقات یہ ہیں۔ بتائیں کون سا چاہیے۔",
        "slot_taken": "{doctor} کے پاس اس وقت کوئی جگہ خالی نہیں۔ خالی اوقات نیچے ہیں۔", "none_found": "اگلے 30 دن میں {doctor} کا کوئی خالی وقت نہیں ملا۔",
        "ok_book": "آپ کی اپائنٹمنٹ بک ہو گئی ہے۔", "ok_reschedule": "آپ کی اپائنٹمنٹ منتقل ہو گئی ہے۔", "ok_cancel": "{doctor} کے ساتھ {when} کی اپائنٹمنٹ منسوخ ہو گئی ہے۔",
        "failed": "اپائنٹمنٹ میں کوئی تبدیلی نہیں ہوئی۔ وجہ: {reason}", "retry_slot": "براہِ کرم کوئی اور وقت منتخب کریں۔",
        "no_response": "نتیجے کی تصدیق نہیں ہو سکی۔ دوبارہ کوشش سے پہلے «میری اپائنٹمنٹس» دیکھ لیں تاکہ دو بار بک نہ ہو۔",
        "reasons": {"SLOT_UNAVAILABLE": "وہ وقت ابھی کسی اور نے لے لیا", "SLOT_IN_PAST": "وہ وقت گزر چکا ہے", "TOO_FAR_AHEAD": "اپائنٹمنٹ صرف 30 دن آگے تک بک ہو سکتی ہے",
                    "PATIENT_OVERLAP": "اس وقت آپ کی پہلے سے ایک اپائنٹمنٹ ہے", "BOOKING_LIMIT_REACHED": "آپ کی پہلے ہی 3 آنے والی اپائنٹمنٹس ہیں (زیادہ سے زیادہ حد)",
                    "APPOINTMENT_LOCKED": "اس اپائنٹمنٹ کو اب تبدیل نہیں کیا جا سکتا (شاید آپ چیک اِن ہو چکے ہیں)", "NOT_FOUND": "اپائنٹمنٹ یا ڈاکٹر نہیں ملا",
                    "VALIDATION_ERROR": "درخواست درست نہیں تھی", "NO_RESPONSE": "ہسپتال کے نظام سے جواب نہیں آیا"},
        "reason_other": "ہسپتال کے نظام نے درخواست قبول نہیں کی",
    },
    "roman": {
        "when": "{date}, {time}", "doctor": "Doctor", "department": "Shobah", "date": "Tareekh", "time": "Waqt", "room": "Kamra", "token": "Appointment token", "booking": "Booking no",
        "confirm_book": "Main yeh appointment book kar sakta hoon:", "confirm_tail": "Kya book kar doon? Confirm ke liye yes likhein ya cancel ke liye no likhein.",
        "confirm_cancel": "Kya {doctor} ke saath {when} ki appointment cancel kar doon? Confirm ke liye yes likhein ya rakhne ke liye no likhein.",
        "confirm_move": "Kya {doctor} ke saath appointment {old} se {new} par move kar doon? Confirm ke liye yes likhein ya rakhne ke liye no likhein.",
        "declined": "Theek hai, kuch change nahi kiya.", "reask": "Barah-e-karam yes ya no likhein.", "reask_pick": "Barah-e-karam appointment ka number likhein.",
        "working_book": "Ek lamha, aap ki appointment book kar raha hoon…", "working_cancel": "Ek lamha, aap ki appointment cancel kar raha hoon…", "working_reschedule": "Ek lamha, aap ki appointment move kar raha hoon…",
        "no_appts": "Aap ki koi aane wali appointment nahi hai jo change ho sake.", "pick": "Aap kaun si appointment ki baat kar rahe hain? Uska number likhein:",
        "ask_slot": "{doctor} ke saath aap ki appointment ({when}) move ki ja rahi hai. Aap kaun sa din aur waqt chahte hain? Misal: 2026-12-01 10:30. Khali auqaat neeche hain.",
        "ask_time": "{date} ke khali auqaat yeh hain. Bataein kaun sa chahiye.",
        "slot_taken": "{doctor} ke paas us waqt koi jagah khali nahi. Khali auqaat neeche hain.", "none_found": "Agle 30 din mein {doctor} ka koi khali waqt nahi mila.",
        "ok_book": "Aap ki appointment book ho gayi hai.", "ok_reschedule": "Aap ki appointment move ho gayi hai.", "ok_cancel": "{doctor} ke saath {when} ki appointment cancel ho gayi hai.",
        "failed": "Appointment mein koi change nahi hua. Wajah: {reason}", "retry_slot": "Barah-e-karam koi aur waqt chunein.",
        "no_response": "Natija confirm nahi ho saka. Dobara koshish se pehle “My appointments” dekh lein taake do baar book na ho.",
        "reasons": {"SLOT_UNAVAILABLE": "woh waqt abhi kisi aur ne le liya", "SLOT_IN_PAST": "woh waqt guzar chuka hai", "TOO_FAR_AHEAD": "appointment sirf 30 din aage tak book ho sakti hai",
                    "PATIENT_OVERLAP": "us waqt aap ki pehle se ek appointment hai", "BOOKING_LIMIT_REACHED": "aap ki pehle hi 3 aane wali appointments hain (zyada se zyada hadd)",
                    "APPOINTMENT_LOCKED": "ab is appointment ko change nahi kiya ja sakta (shayad aap check-in ho chuke hain)", "NOT_FOUND": "appointment ya doctor nahi mila",
                    "VALIDATION_ERROR": "request durust nahi thi", "NO_RESPONSE": "hospital system se jawab nahi aaya"},
        "reason_other": "hospital system ne request qubool nahi ki",
    },
}


def words(language: str) -> dict:
    return TEXT.get(language) or TEXT["english"]


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().strip(" .!?،۔\n\t")).strip()


def has_word(lowered: str, terms) -> bool:
    return any(re.search(rf"(?<![\w\u0600-\u06ff]){re.escape(term)}(?![\w\u0600-\u06ff])", lowered) for term in terms)


def when_text(day: str, hhmm: str, language: str) -> str:
    d = date.fromisoformat(day)
    return words(language)["when"].format(date=f"{d:%a} {d.day} {d:%b %Y}", time=hhmm)


# ---------------------------------------------------------------- reading the patient's words
def parse_time(text: str) -> str | None:
    match = re.search(r"(?<![\d:])(\d{1,2}):(\d{2})\s*(am|pm)?\b", text.lower()) or re.search(r"(?<![\d:])(\d{1,2})()\s*(am|pm)\b", text.lower())
    if not match:
        return None
    hour, minute, meridian = int(match.group(1)), int(match.group(2) or 0), match.group(3)
    if meridian == "pm" and hour < 12:
        hour += 12
    if meridian == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}" if hour < 24 and minute < 60 else None


def parse_day(text: str, today: date) -> date | None:
    lowered = text.lower()
    iso = re.search(r"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)", lowered)
    if iso:
        try:
            return date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
        except ValueError:
            return None
    month_pattern = "|".join(MONTHS)
    found = re.search(rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?\s*({month_pattern})[a-z]*", lowered) or None
    day_number = month_name = None
    if found:
        day_number, month_name = int(found.group(1)), found.group(2)
    else:
        found = re.search(rf"({month_pattern})[a-z]*\s*(\d{{1,2}})(?!\d)", lowered)
        if found:
            month_name, day_number = found.group(1), int(found.group(2))
    if found:
        try:
            result = date(today.year, MONTHS[month_name], day_number)
            return result if result >= today else date(today.year + 1, MONTHS[month_name], day_number)
        except ValueError:
            return None
    if has_word(lowered, ("tomorrow", "kal", "کل")):
        return today + timedelta(days=1)
    if has_word(lowered, ("today", "aaj", "آج")):
        return today
    for name, index in WEEKDAYS.items():
        if has_word(lowered, (name,)):
            return today + timedelta(days=(index - today.weekday()) % 7)
    return None


def named_doctor(text: str, doctors: list[dict]) -> dict | None:
    """The doctor the message names (by NAME only; a specialty alone is not enough). None unless exactly one matches."""
    terms = [t for t in re.findall(r"[^\W\d_]+", text.lower()) if len(t) > 2 and t not in NOT_NAMES]
    if not terms:
        return None
    hits = [d for d in doctors if any(t[:5] in d["name"].lower() for t in terms)]
    return hits[0] if len(hits) == 1 else None


def intent_of(lowered: str) -> str | None:
    if has_word(lowered, CANCEL_WORDS) and has_word(lowered, APPT_WORDS):
        return "cancel"
    if has_word(lowered, RESCHEDULE_WORDS) and (has_word(lowered, APPT_WORDS) or has_word(lowered, ("reschedule",))):
        return "reschedule"
    return None


# ---------------------------------------------------------------- helpers
async def to(function, *args, **kwargs):
    return await asyncio.to_thread(function, *args, **kwargs)


def doctor_card(doctor: dict, day: str, slots: list[dict]) -> dict:
    return {**doctor, "date": day, "slots": [s["time"] for s in slots][:6], "room": slots[0]["room_label"] if slots else ""}


async def card_for(connector: HospitalConnector, doctor: dict, patient: int, day: date | None, ignore: int | None = None) -> dict:
    if day:
        slots = await to(connector.slots, doctor["id"], day, patient, ignore)
        return doctor_card(doctor, day.isoformat(), slots)
    found = await to(connector.next_slots, doctor["id"], patient, None, ignore) or {"date": "", "slots": []}
    return doctor_card(doctor, found["date"], found["slots"])


def doctors_reply(text: str, card: dict):
    return text, {"type": "doctors", "doctors": [card], "booking_enabled": True}


def detail_lines(language: str, doctor: str, department: str, day: str, hhmm: str, room: str) -> list[str]:
    w = words(language)
    lines = [f"{w['doctor']}: {doctor}"]
    if department:
        lines.append(f"{w['department']}: {department}")
    lines += [f"{w['date']}: {when_text(day, hhmm, language).split(',')[0].split('،')[0]}", f"{w['time']}: {hhmm}"]
    if room:
        lines.append(f"{w['room']}: {room}")
    return lines


def issue_action(state: dict, action: str, params: dict, language: str, summary: dict):
    """The patient said yes: remember what was asked and hand the request to the page. One request per yes."""
    action_id = uuid.uuid4().hex
    actions = state.setdefault("actions", {})
    actions[action_id] = {"action": action, "params": params, "language": language, "summary": summary}
    while len(actions) > 20:
        actions.pop(next(iter(actions)))
    state.pop("portal_flow", None)
    return words(language)[f"working_{action}"], {"type": "portal_action", "action_id": action_id, "action": action, "params": params}


# ---------------------------------------------------------------- the conversation
async def handle(user_text: str, language: str, patient_id: str, state: dict, connector: HospitalConnector):
    """(answer, structured, language) when this message belongs to booking / changing / cancelling, else None.
    Short answers (yes / no / a number) are written in the language the conversation started in, even if they look like English."""
    if not connector.configured or not str(patient_id).isdigit():
        return None
    flow = state.get("portal_flow")
    short = norm(user_text)
    if flow and flow.get("language") and (short in YES or short in NO or re.fullmatch(r"\d{1,2}", short)):
        language = flow["language"]
    reply = await _handle(user_text, language, patient_id, state, connector)
    if reply is None:
        return None
    if state.get("portal_flow") is not None:
        state["portal_flow"].setdefault("language", language)
    return (*reply, language)


async def _handle(user_text: str, language: str, patient_id: str, state: dict, connector: HospitalConnector):
    patient = int(patient_id)
    lowered = norm(user_text)
    today = connector.now().astimezone(KARACHI).date()
    flow = state.get("portal_flow")
    intent = intent_of(lowered)
    if flow and intent is None:
        reply = await step(flow, user_text, lowered, language, patient, state, connector, today)
        if reply is not None:
            return reply
        flow = state.get("portal_flow")
    if intent:
        state.pop("portal_flow", None)
        return await start_change(intent, language, patient, state, connector)
    if flow:
        return None
    return await maybe_book(user_text, lowered, language, patient, state, connector, today)


async def maybe_book(user_text, lowered, language, patient, state, connector, today):
    """Typed booking request that names one doctor, e.g. "Book Dr. Sana Malik on 2026-11-30 at 10:00"."""
    if not has_word(lowered, BOOK_WORDS) or lowered in YES or lowered in NO:
        return None
    doctors = await to(connector.doctors)
    doctor = named_doctor(user_text, doctors)
    if doctor is None:
        return None
    day, hhmm = parse_day(user_text, today), parse_time(user_text)
    w = words(language)
    chosen_day = chosen = None
    if day and hhmm:
        slots = await to(connector.slots, doctor["id"], day, patient)
        chosen = next((s for s in slots if s["time"] == hhmm), None)
        chosen_day = day
        if chosen is None:
            return doctors_reply(w["slot_taken"].format(doctor=doctor["name"]), doctor_card(doctor, day.isoformat(), slots))
    elif hhmm:   # time without a day: the first day that has this time free
        for offset in range(MAX_ADVANCE_DAYS + 1):
            slots = await to(connector.slots, doctor["id"], today + timedelta(days=offset), patient)
            chosen = next((s for s in slots if s["time"] == hhmm), None)
            if chosen:
                chosen_day = today + timedelta(days=offset)
                break
        if chosen is None:
            return doctors_reply(w["slot_taken"].format(doctor=doctor["name"]), await card_for(connector, doctor, patient, None))
    elif day:    # a day without a time: show the free times, the patient picks one
        card = await card_for(connector, doctor, patient, day)
        return doctors_reply(w["ask_time"].format(date=when_text(day.isoformat(), "", language).split(",")[0].split("،")[0]) if card["slots"] else w["slot_taken"].format(doctor=doctor["name"]), card)
    else:        # nothing but the doctor: propose the first free slot
        card = await card_for(connector, doctor, patient, None)
        if not card["slots"]:
            return doctors_reply(w["none_found"].format(doctor=doctor["name"]), card)
        chosen_day, chosen = date.fromisoformat(card["date"]), {"time": card["slots"][0], "room_label": card["room"]}
    proposal = {"doctor_id": doctor["id"], "doctor_name": doctor["name"], "department": doctor["department"], "date": chosen_day.isoformat(), "time": chosen["time"], "room": chosen.get("room_label", "")}
    state["portal_flow"] = {"step": "confirm_book", "tries": 0, **proposal}
    lines = [w["confirm_book"], *detail_lines(language, proposal["doctor_name"], proposal["department"], proposal["date"], proposal["time"], proposal["room"]), "", w["confirm_tail"]]
    return "\n".join(lines), {"type": "confirm", "action": "book", "appointment": {k: proposal[k] for k in ("doctor_name", "department", "date", "time", "room")}}


async def start_change(intent: str, language: str, patient: int, state: dict, connector: HospitalConnector):
    w = words(language)
    appointments = await to(connector.appointments, patient)
    if not appointments:
        return w["no_appts"], None
    if len(appointments) == 1:
        return await after_pick(intent, appointments[0], language, patient, state, connector)
    state["portal_flow"] = {"step": "pick", "intent": intent, "ids": [a["id"] for a in appointments], "tries": 0}
    lines = [w["pick"]] + [f"{i}. {a['doctor_name']} — {when_text(a['date'], a['time'], language)}" + (f" ({a['token_no']})" if a["token_no"] else "") for i, a in enumerate(appointments, 1)]
    return "\n".join(lines), None


async def after_pick(intent: str, appointment: dict, language: str, patient: int, state: dict, connector: HospitalConnector):
    w = words(language)
    when = when_text(appointment["date"], appointment["time"], language)
    if intent == "cancel":
        state["portal_flow"] = {"step": "confirm_cancel", "appointment": appointment, "tries": 0}
        return w["confirm_cancel"].format(doctor=appointment["doctor_name"], when=when), {"type": "confirm", "action": "cancel", "appointment": {"doctor_name": appointment["doctor_name"], "date": appointment["date"], "time": appointment["time"], "room": appointment["room"]}}
    state["portal_flow"] = {"step": "slot", "appointment": appointment, "tries": 0}
    doctor = {"id": appointment["doctor_id"], "name": appointment["doctor_name"], "department": "", "specialty": ""}
    card = await card_for(connector, doctor, patient, None, appointment["id"])
    return doctors_reply(w["ask_slot"].format(doctor=appointment["doctor_name"], when=when), card)


def retry(flow: dict, state: dict, text: str, language: str, lowered: str):
    """Not understood: ask once more; if still not understood (or it is clearly a new booking request) leave the flow."""
    if flow.get("tries", 0) >= 1 or has_word(lowered, BOOK_WORDS):
        state.pop("portal_flow", None)
        return None
    flow["tries"] = flow.get("tries", 0) + 1
    return text, None


async def step(flow, user_text, lowered, language, patient, state, connector, today):
    w = words(language)
    name = flow["step"]
    if name in ("confirm_book", "confirm_cancel", "confirm_move"):
        if lowered in NO:
            state.pop("portal_flow", None)
            return w["declined"], None
        if lowered not in YES:
            return retry(flow, state, w["reask"], language, lowered)
        if name == "confirm_book":
            summary = {k: flow[k] for k in ("doctor_name", "department", "date", "time", "room")}
            return issue_action(state, "book", {"doctor_id": flow["doctor_id"], "date": flow["date"], "time": flow["time"]}, language, summary)
        appointment = flow["appointment"]
        summary = {"doctor_name": appointment["doctor_name"], "date": appointment["date"], "time": appointment["time"], "room": appointment["room"]}
        if name == "confirm_cancel":
            return issue_action(state, "cancel", {"appointment_id": appointment["id"]}, language, summary)
        summary |= {"old_date": appointment["date"], "old_time": appointment["time"], "date": flow["date"], "time": flow["time"], "room": flow["room"]}
        return issue_action(state, "reschedule", {"appointment_id": appointment["id"], "date": flow["date"], "time": flow["time"]}, language, summary)

    if name == "pick":
        if lowered in NO:
            state.pop("portal_flow", None)
            return w["declined"], None
        current = {a["id"]: a for a in await to(connector.appointments, patient)}
        options = [current[i] for i in flow["ids"] if i in current]
        chosen = None
        number = re.fullmatch(r"(?:no\.?\s*|number\s*|#)?(\d{1,2})", lowered)
        if number and 1 <= int(number.group(1)) <= len(flow["ids"]):
            chosen = current.get(flow["ids"][int(number.group(1)) - 1])
        else:
            day = parse_day(user_text, today)
            by_date = [a for a in options if day and a["date"] == day.isoformat()]
            terms = [t for t in re.findall(r"[^\W\d_]+", lowered) if len(t) > 2 and t not in NOT_NAMES]
            by_name = [a for a in options if terms and any(t[:5] in a["doctor_name"].lower() for t in terms)]
            for group in (by_date, by_name):
                if len(group) == 1:
                    chosen = group[0]
                    break
        if chosen is None:
            return retry(flow, state, w["reask_pick"], language, lowered)
        return await after_pick(flow["intent"], chosen, language, patient, state, connector)

    if name == "slot":
        if lowered in NO:
            state.pop("portal_flow", None)
            return w["declined"], None
        appointment = flow["appointment"]
        doctor = {"id": appointment["doctor_id"], "name": appointment["doctor_name"], "department": "", "specialty": ""}
        day, hhmm = parse_day(user_text, today), parse_time(user_text)
        if has_word(lowered, ("first", "earliest", "pehla", "جلد")) or (day is None and hhmm is None):
            if not has_word(lowered, ("first", "earliest", "pehla", "جلد")):
                return retry(flow, state, w["ask_slot"].format(doctor=appointment["doctor_name"], when=when_text(appointment["date"], appointment["time"], language)), language, lowered)
            card = await card_for(connector, doctor, patient, None, appointment["id"])
            if not card["slots"]:
                return doctors_reply(w["none_found"].format(doctor=doctor["name"]), card)
            day, hhmm = date.fromisoformat(card["date"]), card["slots"][0]
        if hhmm is None:
            card = await card_for(connector, doctor, patient, day, appointment["id"])
            return doctors_reply(w["ask_time"].format(date=when_text(day.isoformat(), "", language).split(",")[0].split("،")[0]) if card["slots"] else w["slot_taken"].format(doctor=doctor["name"]), card)
        days = [day] if day else [today + timedelta(days=i) for i in range(MAX_ADVANCE_DAYS + 1)]
        for candidate in days:
            slots = await to(connector.slots, doctor["id"], candidate, patient, appointment["id"])
            match = next((s for s in slots if s["time"] == hhmm), None)
            if match:
                flow.update({"step": "confirm_move", "date": candidate.isoformat(), "time": hhmm, "room": match["room_label"], "tries": 0})
                old, new = when_text(appointment["date"], appointment["time"], language), when_text(candidate.isoformat(), hhmm, language)
                return w["confirm_move"].format(doctor=appointment["doctor_name"], old=old, new=new), {"type": "confirm", "action": "reschedule", "appointment": {
                    "doctor_name": appointment["doctor_name"], "old_date": appointment["date"], "old_time": appointment["time"], "date": candidate.isoformat(), "time": hhmm, "room": match["room_label"]}}
        card = await card_for(connector, doctor, patient, day, appointment["id"])
        return doctors_reply(w["slot_taken"].format(doctor=doctor["name"]), card)
    state.pop("portal_flow", None)
    return None


# ---------------------------------------------------------------- the outcome reported by the portal page
def local_parts(starts_at: str | None):
    if not starts_at:
        return None
    local = as_utc(starts_at).astimezone(KARACHI)
    return local.date().isoformat(), local.strftime("%H:%M")


async def build_outcome(state: dict, action_id: str, ok: bool, data: dict | None, code: str | None, connector: HospitalConnector, patient_id: str):
    """(answer, structured, language) for the outcome of a request issued earlier, or None if there is no such waiting request."""
    pending = (state.get("actions") or {}).pop(action_id, None)
    if pending is None:
        return None
    language, action, summary = pending["language"], pending["action"], pending["summary"]
    w = words(language)
    if ok:
        data = data or {}
        parts = local_parts(data.get("starts_at"))
        day, hhmm = parts if parts else (summary.get("date"), summary.get("time"))
        appointment = {"id": data.get("id"), "doctor_name": data.get("doctor_name") or summary.get("doctor_name"), "department": data.get("department") or summary.get("department") or "",
                       "date": day, "time": hhmm, "room": data.get("room_label") or summary.get("room") or "", "token_no": data.get("token_no") or "", "booking_no": data.get("booking_no") or "", "status": data.get("status") or ""}
        if action == "cancel":
            return w["ok_cancel"].format(doctor=appointment["doctor_name"], when=when_text(summary["date"], summary["time"], language)), {"type": "appointment", "action": "cancel", "appointment": appointment}, language
        lines = [w["ok_book"] if action == "book" else w["ok_reschedule"], *detail_lines(language, appointment["doctor_name"], appointment["department"], day, hhmm, appointment["room"])]
        if appointment["token_no"]:
            lines.append(f"{w['token']}: {appointment['token_no']}")
        if appointment["booking_no"]:
            lines.append(f"{w['booking']}: {appointment['booking_no']}")
        return "\n".join(lines), {"type": "appointment", "action": action, "appointment": appointment}, language

    code = code if code in ERROR_CODES else None
    reason = w["reasons"].get(code, w["reason_other"]) if code else w["reason_other"]
    if code == "NO_RESPONSE":
        return w["no_response"], None, language
    answer = w["failed"].format(reason=f"{reason}" + (f" ({code})" if code else ""))
    structured = None
    if code in ("SLOT_UNAVAILABLE", "SLOT_IN_PAST", "PATIENT_OVERLAP") and action in ("book", "reschedule"):
        try:
            if action == "book":
                doctor_id, name = pending["params"]["doctor_id"], summary["doctor_name"]
                ignore = None
            else:
                appointments = {a["id"]: a for a in await to(connector.appointments, int(patient_id))}
                current = appointments.get(pending["params"]["appointment_id"])
                if current is None:
                    return answer, None, language
                doctor_id, name, ignore = current["doctor_id"], current["doctor_name"], current["id"]
                state["portal_flow"] = {"step": "slot", "appointment": current, "tries": 0}
            card = await card_for(connector, {"id": doctor_id, "name": name, "department": summary.get("department", ""), "specialty": ""}, int(patient_id), None, ignore)
            answer, structured = f"{answer}\n{w['retry_slot']}", {"type": "doctors", "doctors": [card], "booking_enabled": True}
        except Exception:
            structured = None
    return answer, structured, language
