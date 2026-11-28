#!/usr/bin/env bash
# Fresh demo DB + backend (8000) + frontend dev server (5173). Source it, run your browser script, then call stop_env.
export PROJ=${PROJ:-/home/claude/proj}
export PY=${PY:-/home/claude/venv/bin/python}
start_env() {
  cd $PROJ/backend && rm -f e2e.db && export DATABASE_URL=sqlite:///./e2e.db PYTHONPATH=.
  $PY -m scripts.seed >/dev/null && $PY -m scripts.seed_doctor_demo && $PY -m scripts.seed_followup_demo
  (nohup $PY -m uvicorn app.main:app --port 8000 > /tmp/uvicorn.log 2>&1 &)
  cd $PROJ/frontend && (VITE_API_URL=http://localhost:8000/api/v1 VITE_DOCTOR_API_MODE=live nohup npx vite --port 5173 --host 127.0.0.1 > /tmp/vite.log 2>&1 &)
  for i in $(seq 1 40); do curl -s localhost:8000/docs >/dev/null && curl -s localhost:5173 >/dev/null && break; sleep 1; done
}
stop_env() { pkill -f "uvicorn app.main" ; pkill -f "vite --port"; true; }
