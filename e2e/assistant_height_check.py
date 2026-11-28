# Browser check for the Medical assistant iframe height. Needs: both vite dev servers running (5173 portal, 5174 assistant) and `pip install playwright`.
import json, sys
from playwright.sync_api import sync_playwright

CONVS=[{"id":"1","title":"Chest pain and tiredness","updated_at":"2026-11-28 04:30:00"},{"id":"2","title":"Visiting hours","updated_at":"2026-11-20 04:30:00"}]
LONG=[]
for i in range(14):
    LONG.append({"role":"user","content":f"Question number {i} about symptoms and how I feel today"})
    LONG.append({"role":"assistant","content":"This is a long answer. "*20})
SESSION={"token":"t","user":{"id":"p1","role":"patient","full_name":"Ayesha Khan"}}

def handle(route):
    url=route.request.url
    if ":5173" in url or ":5174" in url:
        return route.continue_()
    body={}
    if url.rstrip("/").endswith("/chat/sessions") or "chat/sessions?" in url: body=CONVS
    elif "/chat/sessions/1" in url: body={"messages":LONG}
    route.fulfill(status=200,content_type="application/json",headers={"access-control-allow-origin":"*","access-control-allow-headers":"*"},body=json.dumps(body))

sizes={"desktop":(1440,900),"laptop-short":(1280,640),"tablet":(820,1180),"mobile":(390,844),"mobile-landscape":(844,390)}
ok=True
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,(w,h) in sizes.items():
        ctx=b.new_context(viewport={"width":w,"height":h})
        ctx.add_init_script(f"sessionStorage.setItem('ch_session', JSON.stringify({{token:'t',user:{json.dumps(SESSION['user'])}}})); localStorage.setItem('medical-assistant-session-id:p1','1');")
        pg=ctx.new_page(); pg.route("**/*",handle)
        pg.goto("http://localhost:5173/patient/assistant"); pg.wait_for_timeout(2500)
        fr=pg.frame_locator("iframe")
        info=pg.evaluate("""()=>{const f=document.querySelector('iframe');const r=f.getBoundingClientRect();return {frameH:r.height,frameBottom:r.bottom+scrollY,docH:document.documentElement.scrollHeight,vh:innerHeight}}""")
        inner=pg.frames[1].evaluate("""()=>{const s=[...document.querySelectorAll('div')].find(d=>getComputedStyle(d).overflowY==='auto'&&d.scrollHeight>d.clientHeight);return {docScroll:document.documentElement.scrollHeight-innerHeight,chatScrolls:!!s}}""") if len(pg.frames)>1 else {}
        pageScroll=info["docH"]-info["vh"]
        print(name,(w,h),info,inner,"page_overflow_px=",pageScroll)
        pg.screenshot(path=f"/home/claude/test/{name}.png")
        ctx.close()
    b.close()
