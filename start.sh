#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker is not installed or is not running. Start Docker Desktop / Docker Engine, then try again."
  exit 1
fi

# backend/.env holds the secrets (SECRET_KEY, GROQ_API_KEY, SMTP_*). It is optional for a first run.
[[ -f .env ]] || cp .env.example .env

echo "Building and starting CityHospital (database, API servers, frontends)..."
docker compose up -d --build

echo "Waiting for the first startup to finish..."
ready=0
for _ in $(seq 1 360); do
  if curl --silent --fail http://localhost:5173/ >/dev/null; then
    ready=1
    break
  fi
  sleep 5
done

if [[ "$ready" != 1 ]]; then
  echo "CityHospital did not become ready. Check the service logs with: docker compose logs"
  exit 1
fi

echo "CityHospital is ready at http://localhost:5173"
if command -v open >/dev/null 2>&1; then
  open http://localhost:5173
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:5173 >/dev/null 2>&1 &
fi
