# CityHospital - LLM-Augmented Healthcare Management System

FYP (CUI Attock, FA23-BSE-002 / FA23-BSE-009). React + Tailwind frontend, FastAPI backend, PostgreSQL,
with LangChain / GPT-4o / FAISS-Chroma added in Phase 3.

## Folder structure
```
CityHospital/
├── frontend/                 React 18 + Vite + Tailwind CSS
│   └── src/
│       ├── components/{common,auth}   reusable UI + login/register forms
│       ├── context/          AuthContext (JWT session), LanguageContext (EN/UR + RTL)
│       ├── i18n/             en.js, ur.js translations
│       ├── pages/{auth,dashboards}    Screen 1 + role dashboard placeholders
│       ├── routes/           AppRoutes, ProtectedRoute (role based)
│       ├── services/         axios client, authService, session storage
│       └── utils/            zod validators, API error mapping
├── backend/                  FastAPI (Python 3.11)
│   ├── app/
│   │   ├── api/v1/routes/    auth.py (register, login, me)   <- add doctors, appointments...
│   │   ├── core/             config, JWT + bcrypt security
│   │   ├── db/               SQLAlchemy engine/session
│   │   ├── models/ schemas/ services/
│   │   └── rag/ chatbot/ summarizer/   (Phase 3 - LLM features)
│   ├── scripts/seed.py       creates first admin + demo doctor
│   └── tests/                pytest
├── ai/                       knowledge base + embeddings
├── evaluation/               400-query bilingual benchmark + metrics
├── docs/
└── docker-compose.yml        PostgreSQL + both APIs + both frontends
```

## Run the full project with Docker (recommended)

Install Docker Desktop (or Docker Engine with the Compose plugin), then from the repository root:

```bash
cp backend/.env.example backend/.env
cp medical-assistant/.env.example medical-assistant/.env
# Add your GroqCloud key to backend/.env if you want to use Groq.
docker compose up --build
```

Compose is the one-command orchestrator; it builds and runs five separate containers and waits for the database and APIs to become healthy:

| Service | Address |
|---|---|
| CityHospital frontend | <http://localhost:5173> |
| Medical Assistant frontend | <http://localhost:5174> |
| CityHospital API docs | <http://localhost:8000/docs> |
| Medical Assistant API docs | <http://localhost:8010/docs> |
| PostgreSQL (from host tools) | `localhost:5434` |

The CityHospital API seeds the admin and demo doctor at startup. Sign in with the seed account below. PostgreSQL data is kept in the `pgdata` Docker volume when containers stop or are rebuilt. Use `docker compose down` to stop the stack; `docker compose down -v` also deletes the database volume. If host port 5434 is already taken, set `POSTGRES_HOST_PORT` in a root `.env` file to another free port. To stop the stack, press Ctrl+C in the Compose terminal or run `docker compose down` from another terminal.

The Medical Assistant container can reach Ollama running on the host at `http://host.docker.internal:11434` by default. If needed, set `OLLAMA_BASE_URL` in the root `.env` file. Provider API keys belong in backend `.env` files, never in frontend files.

## Run (manually)
**Backend** (Python 3.11, PostgreSQL running with the DB from `.env`):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # configure DATABASE_URL for your PostgreSQL server
python -m scripts.seed
uvicorn app.main:app --reload
pytest                                                 # run tests
```
The backend uses PostgreSQL for accounts, conversations, messages, chatbot usage, settings, and admin audit records. Docker Compose starts the configured PostgreSQL database. The Medical Assistant can share it for conversations, messages, patient records, doctors, appointments, and summaries by setting `MEDICAL_ASSISTANT_DATABASE_URL`. For existing SQLite data, run `python -m scripts.migrate_sqlite_to_postgres` from each service's backend directory once; the migration refuses to copy into non-empty target tables.

**Frontend** (Node 18+):
```bash
cd frontend
npm install
npm run dev
```

## Seed accounts (change in production)
| Role   | Email                        | Password      |
|--------|------------------------------|---------------|
| Admin  | admin@cityhospital.pk        | Admin@12345   |
| Doctor | imran.malik@cityhospital.pk  | Doctor@12345  |
Patients register themselves from the Register tab. Set `GROQ_API_KEY` in `backend/.env` for GroqCloud, or configure a reachable Ollama service; do not put provider keys in frontend files.

## Admin portal
Log in as **Admin** -> `/admin`: Overview, Staff, Departments, Roles, Permissions, Knowledge Base monitoring, Research evaluation, and audit log records.
Reusable pieces: `components/layout/DashboardLayout` (sidebar shell for any role), `components/common/{Card,StatCard,Badge,DataTable,Modal,PageHeader}`.
Most staff and administration pages still use mocked data; chatbot health, usage, model settings, and audit records use the backend.

## Languages
The UI and the AI chatbot are bilingual only: **English and Urdu** (`en` / `ur`). No other languages are planned.

## Validation rules (frontend zod + backend pydantic, kept identical)
- Name 3-50 chars, letters/spaces/. ' - (English or Urdu)
- Email valid format, stored lowercase, unique
- Mobile `03XXXXXXXXX` or `+923XXXXXXXXX` (spaces/dashes allowed)
- DOB in the past, max 120 years
- Gender required; password 8-64 chars with upper, lower, number, special, no spaces; confirm must match
- Terms checkbox required; role can never be chosen by the client on register (always patient)
- Login: same error for wrong email/password/role (no account enumeration)


## Admin module
Screens under `/admin` (sidebar): Overview, Staff, **Departments**, **Roles**, **Permissions**, live **Knowledge Base** model and usage monitoring,
**Research evaluation**, and Audit log records. All new screens work in English and Urdu (RTL).

| Screen | What it does |
|---|---|
| Departments | Add / edit / delete departments. A department that still has staff cannot be deleted. |
| Permissions | Add / edit / delete permissions (name, unique code, description). Starts with View, Create, Edit, Delete. Deleting one also removes it from every role. |
| Roles | Add / edit / delete roles. Pick a role, switch permissions on/off, then *Save changes* - only switched-on permissions are active for that role. The 5 system roles (doctor, receptionist, pharmacist, nurse, admin) cannot be deleted. A role that has staff cannot be deleted. |
| Staff (changed) | Add/Edit staff now has a **Department** field; the role list comes from the Roles screen; the table shows the department. |
| Research evaluation | *Results*: run an evaluation, Top-1 accuracy EN vs UR, Urdu-English gap, ROUGE-L, by-category chart + table, summarizer metrics, incorrect answers, CSV export. *Benchmark dataset*: progress to 400 queries (200 EN + 200 UR), search/filter, add/edit/delete queries with ground truth, CSV export. |

Most admin pages still use mock data in `frontend/src/services/*Service.js` (in memory, resets on refresh). The Knowledge Base page uses the chatbot backend for live service health, model settings, and usage. Evaluation numbers are **simulated** until the real pipeline in `evaluation/` is connected.

## Chatbot backend integration

The CityHospital API proxies authenticated patient chat requests to the Medical Assistant service and stores conversations,
messages, model selection, per-model token/latency usage, and admin change history in PostgreSQL. Configure the Medical Assistant's
`MEDICAL_ASSISTANT_DATABASE_URL` to store its service records in the same database; standalone mode can still use SQLite. Configure `MEDICAL_ASSISTANT_URL` (default
`http://localhost:8010`) and optionally `MEDICAL_ASSISTANT_API_KEY` if the Medical Assistant API requires scoped keys.
Set `GROQ_MONTHLY_TOKEN_LIMIT` only when the applicable quota is known; the admin monitoring API reports remaining tokens
only when a positive limit is configured. Groq failures, including quota, timeout, and API/network errors, can trigger Ollama fallback;
once used, the local provider remains selected until an admin selects Groq again. Chatbot monitoring tables are created or upgraded
by the idempotent startup migration in `backend/app/db/migrations/`.

Authenticated patient endpoints are `/api/v1/chat/sessions` and `/api/v1/chat/sessions/{id}/messages`. Admin-only endpoints
include `GET /api/v1/admin/models`, `GET /api/v1/admin/models/{model_id}/usage`, service and settings updates under
`/api/v1/admin/`, plus the admin-only live socket at `/ws/admin/knowledge-base`. The socket authenticates with the existing JWT
as its first message. Usage changes and admin setting changes are stored in PostgreSQL when running with Docker Compose.

## Patient chatbot integration

Patient login and registration use the CityHospital authentication screens. After sign-in, `/patient` embeds the existing Medical Assistant frontend from `medical-assistant/frontend`; it does not recreate the chat interface. In embedded mode, chat requests use the CityHospital JWT and go through `/api/v1/chat/sessions`, so CityHospital stores the conversation and per-model usage and broadcasts changes to the admin Knowledge Base page. The standalone Medical Assistant page remains available for its demo workflow; queries sent directly to its API are not included in CityHospital's admin usage totals.

For local integration development, start these four services in separate terminals:

```bash
# Terminal 1: Medical Assistant API (port 8010)
cd medical-assistant/backend && ../.venv/bin/uvicorn app.main:app --reload --port 8010

# Terminal 2: existing Medical Assistant frontend (port 5174)
cd medical-assistant/frontend && npm run dev

# Terminal 3: CityHospital API (port 8000)
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

# Terminal 4: CityHospital frontend (port 5173)
cd frontend && npm run dev
```

Open `http://localhost:5173/register` to create a patient account, or sign in at `http://localhost:5173/login` and select **Patient**. The embedded app URL defaults to `http://localhost:5174`; set `VITE_MEDICAL_ASSISTANT_FRONTEND_URL` if it runs elsewhere. CityHospital owns model routing, fallback, usage records, and admin settings.
