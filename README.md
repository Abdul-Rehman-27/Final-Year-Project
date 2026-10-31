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
└── docker-compose.yml        PostgreSQL + backend + frontend
```

## Run (Docker - easiest)
```bash
docker compose up --build
docker compose exec backend python -m scripts.seed     # creates admin + doctor
```
Frontend http://localhost:5173 - API docs http://localhost:8000/docs

## Run (manually)
**Backend** (Python 3.11, PostgreSQL running with the DB from `.env`):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # default DATABASE_URL is SQLite (no install needed)
python -m scripts.seed
uvicorn app.main:app --reload
pytest                                                 # run tests
```
Default database is SQLite (`dev.db`). To use PostgreSQL: `pip install -r requirements-postgres.txt` and set `DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/cityhospital` (Docker Compose already does this).

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
Patients register themselves from the Register tab.

## Admin portal (frontend, sample data)
Log in as **Admin** -> `/admin`: Overview (stats + staff accounts), Staff (full list), Knowledge Base / Audit logs (coming soon).
Reusable pieces: `components/layout/DashboardLayout` (sidebar shell for any role), `components/common/{Card,StatCard,Badge,DataTable,Modal,PageHeader}`.
Staff data is mocked in `src/services/staffService.js` (+ `src/data/mockStaff.js`); swap that one file for real API calls later.

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
