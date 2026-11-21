#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker is not installed or is not running. Start Docker Desktop / Docker Engine, then try again."
  exit 1
fi

[[ -f backend/.env ]] || cp backend/.env.example backend/.env
[[ -f medical-assistant/.env ]] || cp medical-assistant/.env.example medical-assistant/.env
[[ -f .env ]] || cp .env.example .env

dockerhub_user=$(sed -n 's/^DOCKERHUB_USERNAME=//p' .env | tail -n 1)
dockerhub_repo=$(sed -n 's/^DOCKERHUB_REPOSITORY=//p' .env | tail -n 1)
if [[ -z "$dockerhub_user" || "$dockerhub_user" == local || -z "$dockerhub_repo" || "$dockerhub_repo" == cityhospital ]]; then
  echo "One-time setup required: edit .env and set DOCKERHUB_USERNAME and DOCKERHUB_REPOSITORY to the published Docker Hub image namespace and repository name."
  exit 1
fi

echo "Pulling the application images..."
docker compose pull
echo "Starting CityHospital and its services..."
docker compose up -d

echo "Waiting for the first startup and Ollama model downloads to finish..."
ready=0
for _ in $(seq 1 3600); do
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
