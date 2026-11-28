# Running CityHospital with Docker

One command starts everything:

```bash
docker compose up --build
```

(or double-click `start-windows.bat` / run `./start.sh`). Stop with `Ctrl+C` or `docker compose down`.

## The three containers

| Container | What it runs | Ports |
|---|---|---|
| `db` | PostgreSQL with two databases: `cityhospital` (project) and `medical_assistant` | 5434 (optional, for DB tools) |
| `api` | Both FastAPI servers: CityHospital API and Medical Assistant API | 8000, 8010 |
| `web` | Both frontends: CityHospital app and Medical Assistant app | 5173, 5174 |

Open **http://localhost:5173**.

## How the Medical Assistant is connected

- **Patient portal:** the patient chat page embeds the Medical Assistant app (served on 5174) in an iframe and passes it the signed-in patient's session. Chat requests go to the CityHospital API, which calls the assistant inside the `api` container.
- **Doctor portal:** "View Medical History" calls the CityHospital API, which asks the assistant's clinical summarizer for a summary. The summarizer reads the patient's records from the `cityhospital` database, and stores the summary in the `medical_assistant` database.

## Configuration

Secrets go in `backend/.env` (never commit it): `SECRET_KEY`, `GROQ_API_KEY`, `SMTP_*` for password-reset email, `SEED_*` for the first admin/doctor.
You do **not** need to set database addresses there. `docker-compose.yml` sets them for the containers.

The Ollama fallback model is optional. It must run on the host computer (`ollama serve`, listening on all interfaces: `OLLAMA_HOST=0.0.0.0`).

## Useful commands

```bash
docker compose logs -f api          # API logs (both servers)
docker compose exec db psql -U cityhospital -l     # list the two databases
docker compose down -v              # stop and DELETE the databases
```

If you already ran this project with an older compose file, run `docker compose down -v` once so the database volume is recreated with both databases. (The `api` container also creates a missing `medical_assistant` database on startup.)

If you open the app from another computer, set `VITE_API_URL` and `VITE_MEDICAL_ASSISTANT_FRONTEND_URL` (see `.env.example`) to that computer's address and rebuild.
