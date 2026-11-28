# Browser acceptance checks (P5f)

Real Chromium (Playwright for Python) driving the real React UI against the real FastAPI backend on a fresh SQLite demo DB.

Requirements: Python venv with `backend/requirements.txt` (+ `pytest httpx`), `npm install` in `frontend/`, `pip install playwright` + `playwright install chromium`.

```bash
bash -c 'source e2e/env.sh; start_env; python3 e2e/doctor_queue_check.py; stop_env'
bash -c 'source e2e/env.sh; start_env; python3 e2e/full_journey_check.py; stop_env'   # run each on its own fresh DB
```
`env.sh` (edit `PROJ`/`PY`/`DB` in `e2e/common.py` for your machine) recreates `backend/e2e.db`, runs `seed`, `seed_doctor_demo`, `seed_followup_demo`, starts uvicorn :8000 and vite :5173 (`VITE_DOCTOR_API_MODE=live`).

* `doctor_queue_check.py` - 8 steps: complete visit, check-in, call patient (and disabled while another is in progress), write prescription, request lab test, complete, patient portal shows Completed + prescription + lab request.
* `full_journey_check.py` - 11 steps, the final acceptance journey. SETUP done outside the UI: the doctor gets an extra session today (so a same-day booking exists), today's seeded queue is closed out, and step 1b simulates the passage of time by moving the booked visit start to "1 minute ago" (check-in only appears once the visit time has arrived).
* The follow-up time is chosen from the VISIBLE slot dropdown (`select:visible`), which fixes the earlier 14/15 result caused by a selector matching a hidden option.
Each script prints PASS/FAIL per step plus any API 4xx/5xx seen, and exits non-zero on failure.

* `assistant_booking_check.py` - step 4 chat booking through the portal bridge (API mocked; needs the portal and assistant vite dev servers on 5173 / 5174).
