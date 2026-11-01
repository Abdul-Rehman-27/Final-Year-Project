# Medical Assistant Services

An independently runnable, API-first medical assistant with two separate service boundaries:

1. **Patient chatbot** — saved, patient-scoped conversations; English, Urdu, and Roman Urdu responses; clarifying questions; data-grounded hospital and patient-record answers; appointment availability and confirmation before booking.
2. **Doctor clinical summarizer** — accepts a PDF, UTF-8 text, CSV, or JSON record and returns ten structured clinical fields. The interface renders labeled cards rather than displaying raw JSON.

Both services use the GroqCloud `openai/gpt-oss-120b` model. When Groq reports a token/context quota or token-rate limit error, the server retries with the first locally available Ollama model (or the model named by `OLLAMA_MODEL`). Patients cannot choose the model. Model connectivity is shown in the interface and available from the health API.

## Run as a standalone service

Python 3.11 or newer is recommended. From the project root:

```bash
python3 -m venv medical-assistant/.venv
source medical-assistant/.venv/bin/activate
pip install -r medical-assistant/backend/requirements.txt
```

Paste your GroqCloud key into the `GROQ_API_KEY` variable in the existing `backend/.env` file. The variable has been added there with an empty value. The default model is `openai/gpt-oss-120b`. If you need different standalone settings, copy `medical-assistant/.env.example` to `medical-assistant/.env` and edit it. You can also export `OLLAMA_BASE_URL` and `OLLAMA_MODEL`; leave the model blank to use Ollama's first installed model.

Start the API from the `medical-assistant/backend` directory:

```bash
cd medical-assistant/backend
uvicorn app.main:app --reload --port 8010
```

The standalone frontend follows this project's React 18 + Vite + Tailwind stack. In another terminal:

```bash
cd medical-assistant/frontend
npm install
npm run dev
```

Open the React application at `http://localhost:5174`. Vite proxies API calls to `http://localhost:8010`; interactive API documentation is at `http://localhost:8010/docs`. To build the frontend for serving from FastAPI, run `npm run build`; the backend serves the generated `dist/` directory when present. SQLite conversation and integration data is stored in `medical-assistant/data.sqlite3` by default.

### Run each API as an independent service

The patient chatbot and clinical summarizer also have separate FastAPI entrypoints, so they can be deployed, versioned, and exposed independently. Run each command from `medical-assistant/backend`:

```bash
uvicorn app.chat_service:app --port 8011
uvicorn app.summarizer_service:app --port 8012
```

The chatbot API includes chat, patient-record/doctor integration, and model health routes. The summarizer API includes summary create/retrieve and model health routes. Both use the configured SQLite path and model adapter; point `MEDICAL_ASSISTANT_DB` to a shared persistent database volume if they must share records and summaries across processes. For production concurrency, replace SQLite with the host system's managed database.

## Service and API boundaries

All endpoints are versioned under `/api/v1`. The chat and summarizer can be deployed or consumed independently; they share the provider adapter and database layer in this starter service.

| Service | Endpoint | Purpose |
| --- | --- | --- |
| Model status | `GET /api/v1/health` | Live Groq and Ollama connectivity/model status |
| Patient chatbot | `POST /api/v1/chat/sessions` | Create a patient-scoped conversation |
| Patient chatbot | `GET /api/v1/chat/sessions?patient_id=...` | List that patient's conversations |
| Patient chatbot | `GET /api/v1/chat/sessions/{id}?patient_id=...` | Load persisted conversation history |
| Patient chatbot | `POST /api/v1/chat/sessions/{id}/messages` | Ask a question and receive answer, duration, model, and token usage |
| Hospital integration | `POST /api/v1/integrations/patient-records` | Add verified, patient-scoped source material |
| Hospital integration | `POST /api/v1/integrations/doctors` | Upsert a doctor and their available slots |
| Clinical summarizer | `POST /api/v1/summaries` | Upload a record and receive ten structured fields |
| Clinical summarizer | `GET /api/v1/summaries/{id}` | Retrieve a saved clinical summary |

### Example integration payloads

Create a conversation:

```json
{"patient_id":"hospital-patient-123"}
```

Add verified patient information (PDF text can be extracted by the hospital system and supplied here):

```json
{"patient_id":"hospital-patient-123","category":"prescription","content":"Prescription dated 2026-09-12: take medicine X as written by Dr. A.","metadata":{"source":"prescription-456"}}
```

Add a doctor and free appointment slots:

```json
{"id":"doctor-18","name":"Dr. Ayesha Khan","specialty":"Cardiology","hospital":"City Hospital","availability":["2026-11-02 10:00","2026-11-02 11:30"]}
```

When a patient asks to book, the service proposes a slot from the stored availability and asks for explicit confirmation. It creates the booking only after confirmation; the unique doctor/slot constraint prevents double booking within this service database. In a live hospital deployment, replace this local adapter with the hospital's authoritative scheduling API so outside bookings are reflected immediately.

## API access and limits

For local development, an empty `MEDICAL_ASSISTANT_API_KEYS` allows requests without a key. For a deployment, configure separate scoped keys in `medical-assistant/.env`, for example:

```dotenv
MEDICAL_ASSISTANT_API_KEYS=chat-secret=chat:read|chat:write,doctor-secret=summarizer:read|summarizer:write,connector-secret=records:write|doctors:write
```

Clients send the relevant key in the `X-API-Key` header. Available scopes are `chat:read`, `chat:write`, `summarizer:read`, `summarizer:write`, `records:write`, and `doctors:write`; `*` grants all scopes. Keep keys server-side and rotate them when needed. The API enforces maximum message length and upload size, restricts CORS to configured origins, and validates the patient/conversation pairing. The integrating healthcare application must authenticate its users and only pass a patient ID the signed-in user is permitted to access. Do not expose a broad integration key in browser code.

## Clinical summary fields

The API result contains exactly these ten named fields, and the frontend presents each in its own labeled card:

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

Fields absent from the uploaded record are marked as not documented. The service accepts text-based PDFs and UTF-8 text/CSV/JSON files. Image-only PDFs require OCR in the integrating system before upload. Database tables can be exported as JSON or CSV by a connector, or supplied as patient records through the integration endpoint.

## Integration notes and current limits

- This is a new, separate service and is not wired into CityHospital login, role dashboards, or the existing database. Its frontend uses React JSX, Vite, and Tailwind, matching the stack and theme documented by the CityHospital README. The existing application files and README were intentionally left alone; only `backend/.env` gained the empty Groq key variable.
- Until the hospital integration endpoints receive real doctor schedules and patient records, the chatbot reports unavailable hospital or patient-specific information instead of inventing it. No demo patient data is seeded.
- Appointment booking currently writes to this service's SQLite store. A production integration should replace this with the hospital's schedule and booking APIs.
- Patient conversation records are scoped by `patient_id` but the service does not implement patient login or hospital identity verification. Enforce identity, authorization, audit, retention, and applicable privacy requirements in the host system before using real patient information.
- The doctor-facing UI/API is a separate workflow, but this standalone demo does not authenticate a clinician by itself. Protect it behind the host application's doctor role or an authenticated gateway; a service API key is not a substitute for clinician identity.
- The chatbot provides cautious decision support, not diagnosis. Verify clinical summaries and source details before using them in care.
