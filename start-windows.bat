@echo off
setlocal
cd /d "%~dp0"

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not installed or is not running. Start Docker Desktop, then try again.
  pause
  exit /b 1
)

rem backend\.env holds the secrets (SECRET_KEY, GROQ_API_KEY, SMTP_*). It is optional for a first run.
if not exist .env copy .env.example .env >nul

echo Building and starting CityHospital (database, API servers, frontends)...
docker compose up -d --build
if errorlevel 1 goto failed

echo Waiting for the first startup to finish...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddMinutes(30); do { try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:5173/ -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 5 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 goto failed

echo CityHospital is ready at http://localhost:5173
start "" http://localhost:5173
exit /b 0

:failed
echo Startup failed. Check Docker Desktop and run "docker compose logs" from this folder for details.
pause
exit /b 1
