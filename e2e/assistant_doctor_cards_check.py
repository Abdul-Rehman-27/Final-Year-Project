# Browser check for the step 3 doctor and hospital cards (booking buttons must be disabled). Needs both vite dev servers + playwright.
import json, sys
from playwright.sync_api import sync_playwright
DOCS={"type":"doctors","booking_enabled":False,"doctors":[
 {"id":10,"name":"Dr. Sana Malik","department":"Cardiology","specialty":"Cardiologist","date":"2026-11-30","slots":["10:00","10:30","11:30"],"room":"Room 4"},
 {"id":11,"name":"Dr. Imran Malik","department":"Cardiology","specialty":"","date":"","slots":[],"room":""}]}
HOSP={"type":"hospital","hospital":{"name":"CityHospital","address":"Main Road, Karachi","phone":"021-111-222","email":"info@cityhospital.pk","open_hours":"Open 24 hours","emergency_number":"021-555-0100"}}
MSGS=[{"role":"user","content":"Book Dr. Sana Malik for Monday morning"},{"role":"assistant","content":"Available doctors and slots:\n• x","structured":DOCS},
      {"role":"user","content":"visiting hours?"},{"role":"assistant","content":"Hospital information:\n• CityHospital","structured":HOSP}]
def handle(route):
    url=route.request.url
    if ":5173" in url or ":5174" in url: return route.continue_()
    body={}
    if url.rstrip("/").endswith("/chat/sessions") or "chat/sessions?" in url: body=[{"id":"1","title":"Book Dr. Sana","updated_at":"2026-11-28 04:30:00"}]
    elif "/chat/sessions/1" in url: body={"messages":MSGS}
    elif url.endswith("/patient/hospital"): body={"phone":"021-111-222","emergency_number":"021-555-0100"}
    route.fulfill(status=200,content_type="application/json",headers={"access-control-allow-origin":"*","access-control-allow-headers":"*"},body=json.dumps(body))
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1440,"height":1100})
    ctx.add_init_script("sessionStorage.setItem('ch_session', JSON.stringify({token:'t',user:{id:'p1',role:'patient',full_name:'Ayesha Khan'}})); localStorage.setItem('medical-assistant-session-id:p1','1');")
    pg=ctx.new_page(); pg.route("**/*",handle); pg.goto("http://localhost:5173/patient/assistant"); pg.wait_for_timeout(2500)
    f=pg.frames[1]; text=f.inner_text("body")
    buttons=f.locator("button:disabled")
    checks={"doctor names":"Dr. Sana Malik" in text and "Dr. Imran Malik" in text,"next slot line":"Next slot Mon 30 Nov 10:00" in text,"slot chips":all(x in text for x in ("10:30","11:30")),
            "no-slot doctor":"No free slot soon" in text,"book now disabled":f.get_by_role("button",name="Book now").first.is_disabled(),
            "all slot chips disabled":f.get_by_role("button",name="10:30").is_disabled(),"hospital card":"Main Road, Karachi" in text and "021-555-0100" in text}
    print(checks); pg.screenshot(path="/home/claude/test/doctor_cards.png"); b.close(); sys.exit(0 if all(checks.values()) else 1)
