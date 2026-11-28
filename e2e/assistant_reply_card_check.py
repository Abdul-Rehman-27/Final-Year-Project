# Browser check for the Step 2 reply card (banner + cause bars + clarify chip). Needs both vite dev servers (5173, 5174) and playwright.
import json, sys
from playwright.sync_api import sync_playwright

CHEST = {"type":"medical","symptoms":[],"condition":"","possible_causes":[{"name":"Angina","percent":58},{"name":"Anemia","percent":24},{"name":"Acid reflux","percent":12}],"quick_tips":[],
 "emergency":{"level":"see_doctor_soon","reason":"Chest symptoms with dizziness need an examination"},"follow_up_question":"Do you have shortness of breath or left arm pain?"}
URDU = {**CHEST,"emergency":{"level":"emergency","reason":"سینے میں درد کے ساتھ چکر خطرناک ہو سکتے ہیں"},"possible_causes":[{"name":"انجائنا","percent":58},"پرانی قسم کا جواب"]}
MSGS=[{"role":"user","content":"For 3 days I feel pressure in my chest when climbing stairs."},{"role":"assistant","content":"x","structured":CHEST},
      {"role":"user","content":"مجھے سینے میں درد ہے"},{"role":"assistant","content":"x","structured":URDU}]
def handle(route):
    url=route.request.url
    if ":5173" in url or ":5174" in url: return route.continue_()
    body={}
    if url.rstrip("/").endswith("/chat/sessions") or "chat/sessions?" in url: body=[{"id":"1","title":"Chest pain","updated_at":"2026-11-28 04:30:00"}]
    elif "/chat/sessions/1" in url: body={"messages":MSGS}
    elif url.endswith("/patient/hospital"): body={"name":"CityHospital","phone":"021-111-222","emergency_number":"021-555-0100"}
    route.fulfill(status=200,content_type="application/json",headers={"access-control-allow-origin":"*","access-control-allow-headers":"*"},body=json.dumps(body))
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1440,"height":1100})
    ctx.add_init_script("sessionStorage.setItem('ch_session', JSON.stringify({token:'t',user:{id:'p1',role:'patient',full_name:'Ayesha Khan'}})); localStorage.setItem('medical-assistant-session-id:p1','1');")
    pg=ctx.new_page(); pg.route("**/*",handle); pg.goto("http://localhost:5173/patient/assistant"); pg.wait_for_timeout(2500)
    f=pg.frames[1]; text=f.inner_text("body")
    checks={"banner":"See a doctor soon" in text,"hospital number":"021-555-0100" in text,"1122":"1122" in text,"bars":f.locator("[role=progressbar]").count()==4,"percent":"58%" in text,"clarify chip":"shortness of breath" in text,"legacy string cause (no bar)":"پرانی قسم کا جواب" in text}
    print(checks); pg.screenshot(path="/home/claude/test/reply_card.png"); b.close()
    sys.exit(0 if all(checks.values()) else 1)
