@echo off
setlocal
cd /d "%~dp0"

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not installed or is not running. Start Docker Desktop, then try again.
  pause
  exit /b 1
)

if not exist backend\.env copy backend\.env.example backend\.env >nul
if not exist medical-assistant\.env copy medical-assistant\.env.example medical-assistant\.env >nul
if not exist .env copy .env.example .env >nul

findstr /x /c:"DOCKERHUB_USERNAME=local" .env >nul
if not errorlevel 1 goto needs_config
findstr /x /c:"DOCKERHUB_REPOSITORY=cityhospital" .env >nul
if not errorlevel 1 goto needs_config

echo Pulling the application images...
docker compose pull
if errorlevel 1 goto failed
echo Starting CityHospital and its services...
docker compose up -d
if errorlevel 1 goto failed

echo Waiting for the first startup and Ollama model downloads to finish...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddHours(5); do { try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:5173/ -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 5 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 goto failed

echo CityHospital is ready at http://localhost:5173
start "" http://localhost:5173
exit /b 0

:needs_config
echo One-time setup required: edit .env and set DOCKERHUB_USERNAME and DOCKERHUB_REPOSITORY to the published Docker Hub image namespace and repository name.
pause
exit /b 1

:failed
echo Startup failed. Check Docker Desktop and run "docker compose logs" from this folder for details.
pause
exit /b 1
