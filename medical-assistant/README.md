# Medical Assistant

A standalone React and FastAPI application with two workflows:

- **Patient chat:** saved conversations, symptom and general medical questions, doctor availability, appointment requests, and patient-specific record lookups. Chat supports English, Urdu script, and Roman Urdu. Medical model replies can include a structured assessment card; greetings and other non-medical messages use a short text reply.
- **Clinical summarizer:** uploads a patient record and displays a grounded summary in ten labeled fields for clinician review.

The backend uses GroqCloud with the `openai/gpt-oss-120b` model. If Groq reports a token/context limit or returns a response cut off by the token limit, it tries the configured Ollama model. Ollama must be installed and running locally to use this fallback. The model status is shown in the interface and at the health endpoint.

## Requirements

- Python 3.11 or newer
- Node.js and npm
- A GroqCloud API key, or a local Ollama installation with a model available

## Setup

Run these commands from the repository root:

```bash
python3 -m venv medical-assistant/.venv
source medical-assistant/.venv/bin/activate
pip install -r medical-assistant/backend/requirements.txt
cp medical-assistant/.env.example medical-assistant/.env
```

Edit `medical-assistant/.env` and add your Groq key:

```dotenv
GROQ_API_KEY=your_groq_api_key
```

Keep `.env` private; it is ignored by Git. You can instead configure settings as environment variables. `GROQ_API_KEY` may be left empty when using Ollama directly. Set `OLLAMA_BASE_URL` and optionally `OLLAMA_MODEL`; if the model name is empty, the first locally installed Ollama model is selected.

The standalone default SQLite file is `medical-assistant/data.sqlite3`. It is created automatically when the backend starts. `MEDICAL_ASSISTANT_DB` can point to another SQLite file. Set `MEDICAL_ASSISTANT_DATABASE_URL` to store service records in PostgreSQL instead; the CityHospital integration can point it at the same database used for patients and chatbot usage.

## Run the application

### Run the complete CityHospital stack with Docker

From the repository root, create the two private environment files if they do not exist, then start the Compose project:

```bash
cp backend/.env.example backend/.env
cp medical-assistant/.env.example medical-assistant/.env
# Add a GroqCloud key to backend/.env if you want to use Groq.
docker compose up --build
```

This starts PostgreSQL, the CityHospital API and frontend, and this Medical Assistant API and frontend as separate containers. Open the standalone assistant at <http://localhost:5174>; its API docs are at <http://localhost:8010/docs>. The CityHospital app is at <http://localhost:5173>. Compose creates and retains a named PostgreSQL volume across restarts. Run `docker compose down` to stop the stack; `docker compose down -v` also deletes the database volume. See the root README for all service addresses and configuration details.

### Run only the Medical Assistant manually

Start the backend in one terminal from the repository root:

```bash
source medical-assistant/.venv/bin/activate
cd medical-assistant/backend
uvicorn app.main:app --reload --port 8010
```

Start the frontend in a second terminal from the repository root:

```bash
cd medical-assistant/frontend
npm install
npm run dev
```

Open <http://localhost:5174>. Vite forwards `/api` requests to the backend on port `8010`. The FastAPI interactive documentation is at <http://localhost:8010/docs>. Keep both terminals running while using the app.

### Use the existing frontend inside CityHospital

CityHospital embeds this same frontend for signed-in patients at its `/patient` route. In embedded mode, the frontend receives the authenticated patient session from CityHospital and routes conversation create, load, and send requests through CityHospital's `/api/v1/chat/sessions` API. CityHospital then enforces patient ownership, applies its current model and fallback settings, stores usage in its PostgreSQL database, and updates the admin Knowledge Base. The standalone workflow above continues to use this service's direct API and local demo patient reference; those direct requests do not update CityHospital usage totals.

To use embedded mode locally, also run CityHospital's API on port `8000` and frontend on port `5173`. Register or sign in with a **Patient** account and open `/patient`. The Medical Assistant frontend URL defaults to <http://localhost:5174>; CityHospital can override it with `VITE_MEDICAL_ASSISTANT_FRONTEND_URL`. Keep API keys on the backend; the browser receives only the signed-in patient's CityHospital access token for authenticated chat calls.

To migrate existing standalone SQLite records into PostgreSQL, set `MEDICAL_ASSISTANT_DATABASE_URL`, install the backend requirements, and run `../.venv/bin/python -m scripts.migrate_sqlite_to_postgres` from `medical-assistant/backend`. This copies conversations, messages, patient records, doctors, appointments, and summaries; it refuses to duplicate rows into non-empty tables.

To build the frontend for serving from FastAPI, run `npm run build` in `medical-assistant/frontend`. When `frontend/dist` exists, the main FastAPI app serves those static files.

## Optional separate API services

The chat and summarizer APIs can run as separate services. Start each command from `medical-assistant/backend` with the virtual environment active:

```bash
uvicorn app.chat_service:app --reload --port 8011
uvicorn app.summarizer_service:app --reload --port 8012
```

The chat service exposes chat, doctor and patient-record integrations, and health routes. The summarizer service exposes summary and health routes. Both use the configured SQLite database.

## Chat and appointment behavior

Medical questions and symptom descriptions go to the medical assistant model. Replies are returned as plain text in `answer` and may also include a `structured` object for rendering symptoms, a short condition description, possible causes, quick tips, and an emergency level. Greetings, nonsense, and off-topic prompts receive a short polite text reply. Replies follow English, Urdu, or Roman Urdu based on the patient's message.

Appointment and doctor availability requests use the doctors table. A booking request proposes an available slot and asks for confirmation; the appointment is created only after the patient confirms. Patient-specific report or prescription questions use records added through the patient-record integration. The project starts with no doctor schedules or patient records, so these must be provided before those data-backed requests can return relevant information.

## API routes

All routes use the `/api/v1` prefix.

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Groq and Ollama connectivity and model status |
| `POST /chat/sessions` | Create a patient conversation |
| `GET /chat/sessions?patient_id=...` | List a patient's conversations |
| `GET /chat/sessions/{conversation_id}?patient_id=...` | Load conversation messages, including saved structured replies |
| `POST /chat/sessions/{conversation_id}/messages` | Send a message; response includes `answer`, `language`, `structured`, provider, model, timing, and usage |
| `POST /integrations/patient-records` | Add patient-specific source material |
| `POST /integrations/doctors` | Add or update a doctor and available slots |
| `POST /summaries` | Upload a record and create a summary |
| `GET /summaries/{summary_id}` | Retrieve a saved summary |

### Integration examples

Create a conversation:

```json
{"patient_id":"hospital-patient-123"}
```

Add a patient record:

```json
{"patient_id":"hospital-patient-123","category":"prescription","content":"Prescription dated 2026-09-12: take medicine X as written by Dr. A.","metadata":{"source":"prescription-456"}}
```

Add a doctor and appointment slots:

```json
{"id":"doctor-18","name":"Dr. Ayesha Khan","specialty":"Cardiology","hospital":"City Hospital","availability":["2026-11-02 10:00","2026-11-02 11:30"]}
```

Integration requests require the matching API scope when `MEDICAL_ASSISTANT_API_KEYS` is configured.

## Clinical summaries

The summarizer accepts text-based PDFs and UTF-8 text, CSV, or JSON files up to 15 MB. Image-only PDFs need OCR before upload. The backend asks the model to use only facts stated in the source and returns these ten fields:

1. Patient overview
2. Chief complaint
3. Medical history
4. Surgical history
5. Medications
6. Allergies
7. Family history
8. Social history
9. Vitals and results
10. Assessment and plan

Fields without documented information are marked as not documented. Review summaries against the source record before using them in care.

## API keys and configuration

For local development, an empty `MEDICAL_ASSISTANT_API_KEYS` allows API requests without a key. To require scoped keys, set entries in `medical-assistant/.env` using this format:

```dotenv
MEDICAL_ASSISTANT_API_KEYS=chat-secret=chat:read|chat:write,records-secret=records:write,doctors-secret=doctors:write,summary-secret=summarizer:read|summarizer:write
```

Clients send the selected key in the `X-API-Key` header. Supported scopes are `chat:read`, `chat:write`, `records:write`, `doctors:write`, `summarizer:read`, and `summarizer:write`; `*` grants all scopes. Configure real secrets privately and never put them in frontend code or commit them. `MEDICAL_ASSISTANT_CORS_ORIGINS` is a comma-separated list; by default it allows the local frontend and backend origins. `MAX_MESSAGE_CHARS` and `MAX_UPLOAD_MB` configure request limits.

## Current limits and deployment notes

- This is a separate API service with a standalone demo workflow. Standalone mode can use SQLite; CityHospital embedded mode authenticates the patient and can share PostgreSQL for assistant data, while CityHospital owns chatbot settings and usage records.
- In standalone mode, patient references and conversation IDs do not authenticate users. The frontend creates a local patient reference for demonstration, while the API checks that a conversation belongs to the supplied patient reference. Do not use that standalone mode with real patient records without adding authentication and access controls.
- Doctor schedules and appointment bookings are stored in the configured database (SQLite for standalone use or PostgreSQL when configured). A live deployment should use the hospital's authoritative scheduling system so external bookings and availability are reflected.
- The summarizer UI is a clinician workflow, but this standalone project does not authenticate clinicians. Protect it behind an authenticated host application or gateway before deployment.
- The assistant provides general information and decision support, not a diagnosis. For an emergency, contact local emergency services.
