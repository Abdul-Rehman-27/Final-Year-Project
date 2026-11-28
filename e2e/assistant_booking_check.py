# Browser check for step 4: typed booking through the portal bridge. Needs both vite dev servers (5173 portal, 5174 assistant) + playwright.
# API is mocked: the check verifies what the PORTAL PAGE sends (own session, no patient id) and what the chat shows (token from the portal).
import json, sys
from playwright.sync_api import sync_playwright

DOCS = {"type": "doctors", "booking_enabled": True, "doctors": [{"id": 10, "name": "Dr. Sana Malik", "department": "Cardiology", "specialty": "Cardiologist", "date": "2026-11-30", "slots": ["10:00", "10:30"], "room": "Room 4"}]}
APPT = {"id": 7, "doctor_name": "Dr. Sana Malik", "department": "Cardiology", "date": "2026-11-30", "time": "10:30", "room": "Room 4", "token_no": "A025", "booking_no": "APT-0007", "status": "confirmed"}
seen = {"portal": [], "action_results": [], "messages": [], "stored": []}
state = {"n": 0, "refuse": False}


def reply_for(text):
    t = text.lower()
    if t == "yes":
        state["n"] += 1
        return {"answer": "One moment, I'm booking your appointment…", "language": "english", "structured": {"type": "portal_action", "action_id": f"act{state['n']}", "action": "book", "params": {"doctor_id": 10, "date": "2026-11-30", "time": "10:30"}}}
    if t.startswith("book dr. sana malik on 2026-11-30 at 10:30"):
        return {"answer": "I can book this appointment:\nDoctor: Dr. Sana Malik\nDate: Mon 30 Nov 2026\nTime: 10:30\n\nShall I book it? Reply yes to confirm or no to cancel.", "language": "english", "structured": {"type": "confirm", "action": "book", "appointment": {}}}
    return {"answer": "Available doctors and slots:\n• Dr. Sana Malik", "language": "english", "structured": DOCS}


def handle(route):
    req = route.request; url = req.url
    if ":5173" in url or ":5174" in url:
        return route.continue_()
    cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
    if req.method == "OPTIONS":
        return route.fulfill(status=204, headers=cors)
    body, status = {}, 200
    if url.endswith("/patient/appointments") and req.method == "POST":
        seen["portal"].append({"auth": req.headers.get("authorization"), "body": req.post_data_json})
        if state["refuse"]:
            status, body = 409, {"detail": "SLOT_UNAVAILABLE"}
        else:
            body, status = APPT, 201
    elif url.endswith("/action-result"):
        data = req.post_data_json; seen["action_results"].append(data)
        if data["ok"]:
            text = "Your appointment is booked.\nDoctor: Dr. Sana Malik\nAppointment token: A025"
            body = {"answer": text, "language": "english", "structured": {"type": "appointment", "action": "book", "appointment": APPT}}
        else:
            body = {"answer": f"The appointment was not changed. Reason: that time was just taken ({data['code']})", "language": "english", "structured": None}
        seen["stored"].append(body)
    elif req.method == "POST" and url.endswith("/messages"):
        data = req.post_data_json; seen["messages"].append(data)
        body = reply_for(data["message"])
    elif req.method == "POST" and url.rstrip("/").endswith("/chat/sessions"):
        body = {"id": "1", "title": "New conversation"}
    elif url.rstrip("/").endswith("/chat/sessions") or "chat/sessions?" in url:
        body = [{"id": "1", "title": "Booking", "updated_at": "2026-11-28 04:30:00"}]
    elif "/chat/sessions/1" in url:   # history: a reply that asks the page to book must NOT book again when it is re-opened
        body = {"messages": [{"role": "user", "content": "yes"}, {"role": "assistant", "content": "One moment, I'm booking your appointment…", "structured": reply_for("yes")["structured"]}, {"role": "assistant", "content": "Your appointment is booked.", "structured": seen["stored"][0]["structured"] if seen["stored"] else None}]}
    elif url.endswith("/patient/hospital"):
        body = {"phone": "021-111-222", "emergency_number": "021-555-0100"}
    route.fulfill(status=status, content_type="application/json", headers=cors, body=json.dumps(body))


def send(f, text):
    f.locator("textarea").fill(text); f.locator("textarea").press("Enter")


with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 1000})
    ctx.add_init_script("if(!sessionStorage.getItem('ch_session')) sessionStorage.setItem('ch_session', JSON.stringify({token:'portal-token',user:{id:5,role:'patient',full_name:'Ayesha Khan'}}));")
    pg = ctx.new_page(); pg.route("**/*", handle); pg.goto("http://localhost:5173/patient/assistant"); pg.wait_for_timeout(2500)
    f = pg.frames[1]
    # 1) doctor card slot chip -> a normal chat message -> yes/no question
    send(f, "show Dr. Sana Malik"); f.get_by_role("button", name="10:30").wait_for(timeout=8000)
    enabled = f.get_by_role("button", name="10:30").is_enabled() and f.get_by_role("button", name="Book now").is_enabled()
    f.get_by_role("button", name="10:30").click(); f.get_by_text("Reply yes to confirm").wait_for(timeout=8000)
    asked = seen["messages"][-1]["message"] == "Book Dr. Sana Malik on 2026-11-30 at 10:30" and not seen["portal"]
    # 2) yes -> the portal page books with the patient's own session -> token from the portal is shown
    send(f, "yes"); f.get_by_test_id("appointment-token").wait_for(timeout=10000)
    booked = len(seen["portal"]) == 1
    call = seen["portal"][0] if booked else {}
    own_session = call.get("auth") == "Bearer portal-token" and call.get("body") == {"doctor_id": 10, "date": "2026-11-30", "time": "10:30"}
    reported = seen["action_results"][0] == {"action_id": "act1", "ok": True, "appointment_id": 7, "code": None}
    token_shown = f.get_by_test_id("appointment-token").inner_text().strip() == "A025"
    # 3) the portal refuses -> the real code is reported and shown
    state["refuse"] = True
    send(f, "Book Dr. Sana Malik on 2026-11-30 at 10:30"); f.get_by_text("Reply yes to confirm").nth(1).wait_for(timeout=8000)
    send(f, "yes"); f.get_by_text("SLOT_UNAVAILABLE").wait_for(timeout=10000)
    refused = seen["action_results"][1] == {"action_id": "act2", "ok": False, "appointment_id": None, "code": "SLOT_UNAVAILABLE"}
    pg.screenshot(path="/home/claude/test/booking_chat.png")
    # 4) re-opening the conversation (history contains the 'portal_action' reply) must not book again
    before = len(seen["portal"]); pg.reload(); pg.wait_for_timeout(3500)
    no_rebook = len(seen["portal"]) == before and len(seen["action_results"]) == 2
    checks = {"slot chips and Book now enabled": enabled, "chip sends message, nothing booked yet": asked, "portal booked once": booked, "portal used its own token + only doctor/date/time": own_session,
              "chat reported appointment id only": reported, "token A025 shown": token_shown, "portal refusal code reported": refused, "history re-open does not rebook": no_rebook}
    print(checks); b.close(); sys.exit(0 if all(checks.values()) else 1)
