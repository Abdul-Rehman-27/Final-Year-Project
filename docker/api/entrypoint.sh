#!/usr/bin/env bash
# One container, two FastAPI servers:
#   :8000  CityHospital project API      (database: cityhospital)
#   :8010  Medical Assistant API         (database: medical_assistant)
set -euo pipefail

python /app/docker/ensure_databases.py

# Create the project tables and the seed admin/doctor accounts (safe to repeat).
(cd /app/backend && python -m scripts.seed)

(cd /app/medical-assistant/backend && exec uvicorn app.main:app --host 0.0.0.0 --port 8010) &
assistant_pid=$!
(cd /app/backend && exec uvicorn app.main:app --host 0.0.0.0 --port 8000) &
project_pid=$!

stop() { kill "$assistant_pid" "$project_pid" 2>/dev/null || true; }
trap stop TERM INT

# If either server stops, stop the other one too so Docker restarts the container.
set +e
wait -n "$assistant_pid" "$project_pid"
code=$?
stop
wait
exit "$code"
