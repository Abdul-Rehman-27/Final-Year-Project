# TASK: Build the CityHospital Doctor Portal — FRONTEND ONLY

You are working in the existing **CityHospital** monorepo (React 18 + Vite + Tailwind). Implement the approved **doctor** UI designs in `frontend/`: 10 screens and 2 printable documents.

**Scope: frontend only.** Do **not** create or modify anything under `backend/`, `medical-assistant/`, `ai/`, `docker-compose.yml` or any `.env` file other than `frontend/.env.example`. The backend for the doctor portal is written and delivered **separately**. It does not exist yet, so this task includes:
- an **API contract** (§4) — the exact endpoints and JSON shapes the frontend consumes; the backend will be built to match it;
- a **mock API layer** (§B4) that implements that contract in memory, so every screen can be built, run and verified **without a backend**, and switched to the real API later with one environment variable.

The Patient Portal is a **later** task. Several shell components built here (sidebar icons, user card, pill tabs, etc.) will be reused by it, so build them generically (§B1). Nothing here builds patient screens or changes the existing `/patient` route.

---

## 0. Design assets and how to read this prompt

The designs are 12 PNG mockups. Before you start they must exist in the repo at `docs/design/doctor-portal/` with exactly these names:

| File | Becomes |
|---|---|
| `Dashboard.png` | route `/doctor` |
| `Availability.png` | route `/doctor/availability` |
| `Patient_queue.png` | route `/doctor/queue` |
| `Appointment_in_progress.png` | route `/doctor/queue/:appointmentId` |
| `Clinical_summary.png` | routes `/doctor/queue/:appointmentId/summary` and `/doctor/patients/:patientId/summary` |
| `Write_prescription.png` | route `/doctor/queue/:appointmentId/prescription/new` |
| `Prescription_history.png` | route `/doctor/prescriptions` |
| `Lab_tests.png` | route `/doctor/lab-tests` |
| `Patients.png` | route `/doctor/patients` |
| `Patient_profile.png` | route `/doctor/patients/:patientId` |
| `PDF___Prescription.png` | printable prescription |
| `PDF___Patient_profile.png` | printable patient profile |

**If the folder or any file is missing, stop and tell me. Do not guess layouts.** Open and study every mockup before writing code.

**Precedence:** for *visual* layout (spacing, hierarchy, order of elements, button order) the PNG wins. For *behaviour, data, wording and states* this prompt wins. Names, times, counts and numbers that appear in a mockup are **sample data** — never hardcode them in components. If the PNG and this prompt contradict each other on behaviour, or something here contradicts the code you find, **stop and report the conflict** (rule 0.6).

## 0.1 Working rules (read twice)

1. **Do not break what works.** Admin portal, login/register, password reset, the existing `/patient` route (`PatientChat.jsx`, embedded chatbot) and the evaluation module must keep working exactly as today. Every change to a shared file must be **additive** (new optional props, new keys, new routes). Never rename or delete an existing export, route or key.
2. **Work in the phases below, in order** (B foundation + services + mock → C screens → D print documents → E i18n/docs/verification → **F completeness audit → G professional polish and bug sweep**). After each phase run the checks in §10 for that phase and fix problems before moving on. Keep a short running log. **You are not finished when the screens render: you are finished only when Phase F shows nothing Missing/Partial and Phase G's checks pass.**
3. **No new dependencies.** No icon library, no QR library, no PDF library, no date library, no test framework. Inline SVG icons only.
4. **Follow existing patterns**: services in `src/services/*Service.js` using `services/api.js` (axios); hooks in `src/hooks/` shaped like `useStaff.js`; common components from `components/common/` (`Button`, `Badge`, `Card`, `Input`, `Select`, `Textarea`, `Toggle`, `Modal`, `ConfirmDialog`, `Alert`, `DataTable`, `Avatar`, `PageHeader`, `StatCard`, `Tabs`, `LanguageSwitch`); i18n through `useLanguage().t("key")`; RTL-safe Tailwind logical classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `border-e`) exactly like the existing sidebar.
5. **Never invent data in live code paths.** Demo data lives **only** in the mock module (§B4), which is never imported when the mode is `live`. Missing hospital configuration shows the bracketed placeholders exactly as in the mockups (`[HOSPITAL ADDRESS]`, `[PHONE]`, `[EMAIL]`).
6. **If a statement in this prompt contradicts what you find in the code, or a decision in §3 turns out to be impossible, stop and report it.**
7. **Urdu support:** every new UI string needs both `en` and `ur` entries (`src/i18n/en.js`, `ur.js`) and layouts must work in RTL. `t(key)` takes **only a key** (no interpolation). For strings with values use `{n}`-style placeholders in the translation and a new helper `fill(template, values)` in `src/utils/format.js` (additive).
8. In your final report mark every Urdu string you wrote so a native speaker can review it.
9. **The frontend never re-implements server decisions in live mode.** Queue order/state, `can_call`, effective prescription status, tokens, numbers and ages come from the API fields. The only client-side computation allowed is display formatting, the grace-period **countdown** and the availability **slot preview**.

---

## 1. What exists today (verified in the repo — rely on this)

- Tailwind theme in `tailwind.config.js`: `brand-50/100/200/600/700/800`, `brand-tint #DDEFEA`, `surface #F4F8F7`, `ink #0F2A27`, `ink-muted #55706C`, `line #D7E3E0`, font Lato (`font-urdu` = Noto Nastaliq in Urdu). Routing in `src/routes/AppRoutes.jsx` with `ProtectedRoute role="..."`. `/doctor` currently renders `DashboardPlaceholder role="doctor"` and **must be replaced** by the new portal (keep `DashboardPlaceholder` for other uses; do not delete it). The admin portal uses `DashboardLayout navItems={ADMIN_NAV}` with nested routes — follow that pattern. `dashboardPath("doctor")` = `/doctor`, so a doctor who logs in already lands there; login already supports the `doctor` role.
- Session: `sessionStorage` via `services/session.js`; `useAuth()` → `{user, token, logout}`; `user` has `id, full_name, email, role, phone`. `services/api.js` = axios with `VITE_API_URL` (default `http://localhost:8000/api/v1`), attaches the JWT, clears the session on 401.
- `Sidebar.jsx`: logo + text-only links (`text-lg font-bold`) + a "Log out" text button. `DashboardLayout.jsx`: desktop sidebar (`w-64`), mobile drawer, top bar with menu button + `LanguageSwitch`, then `<Outlet/>`. `Tabs` = underline only. `StatCard` = number + label. `DataTable` = `columns:[{header, render, className}]`, `rows`, `loading`, `loadingText`, `emptyText`, cells `px-6 py-4`. `Badge` tones `success | neutral | warning | danger`. `Modal` (max-w-lg). `ConfirmDialog({open,title,itemName,message,confirmLabel,onConfirm,onClose})`. `Button` variants `primary | secondary | danger | dangerOutline`, sizes `md | sm`, **`fullWidth` defaults to true** (pass `fullWidth={false}` for inline buttons). `Avatar({src,name,size})` shows initials. `LanguageSwitch` = EN | اردو pill.
- `utils/format.js` holds small formatters (`pct`, `score`, …). `i18n/index.js`: `translate(lang, key)` walks dotted keys and falls back to the key itself.
- **Printing precedent**: `components/admin/evaluation/ResultsTab.jsx` opens a window synchronously, writes a "preparing" placeholder, then the final HTML made by `renderToStaticMarkup` (`react-dom/server`) of a React component + a CSS file imported with `?inline` (`evaluation-print.css`, A4 pages 794×1122 px), waits for fonts, then `print()`. Follow this for the two PDFs. Do **not** modify the evaluation code.
- Existing mock-data precedent: `src/data/mockStaff.js`, `mockRbac.js`, `mockEvaluation.js`.
- `frontend/package.json` has **no test runner**; scripts are `dev`, `build`, `preview`.

---

## 2. Design system (from the mockups — match closely, using the project's own tokens/components)

- **Page**: `bg-surface`; content cards = `Card` (`rounded-2xl border border-line bg-white`, padding `p-5`). Title row: big black-weight title (`text-3xl font-black`), subtitle `ink-muted`, and the `LanguageSwitch` pill at the **end of the same row**; optional page-level action buttons sit before the pill.
- **Section labels**: 12 px, uppercase, `tracking-[.08em]`, bold, `ink-muted` (e.g. `PATIENT`). Sub-section headings ("Medicines", "Appointment", "Instructions") use the same style in `text-brand-700`.
- **Key-value band** (`InfoGrid`, new common component): `bg-surface rounded-2xl p-[18px]`, CSS grid (`cols` prop, default 3, gap 18 px), each cell = label (section-label style) over a bold 17 px value.
- **Sidebar (doctor)**: logo, small uppercase caption under it (`Doctor portal`), nav items with **22 px line icons** (inline SVG, stroke 1.8, round caps) — Dashboard, Patient queue, Prescriptions, Patients, Lab tests; active = `bg-brand-tint text-brand-700`, inactive `text-ink-muted hover:bg-brand-50`, item `gap-3 px-4 py-3 rounded-xl font-bold text-base`. **Bottom user card** with a divider above: initials `Avatar`, full name bold, department below in muted small text, and a small icon-only **Log out** button at the end (`aria-label` = translated "Log out") — logout must stay reachable.
- **Status badges** (`Badge`): Active / Ready / Confirmed / Waiting / In progress = `success`; Pending / Scheduled / Requested / Not arrived / Holding = `warning`; Completed = `neutral`; Cancelled / Incomplete / Expired = `danger`.
- **Pill tabs**: active `bg-brand-tint text-brand-700 border-brand-tint`, inactive white with `border-line`, `rounded-xl px-[18px] py-2.5 font-bold text-[15px]`. Implemented as `variant="pill"` on the existing `Tabs` (default underline unchanged). Pill tabs act as **filters/switches** that change what a card shows.
- **Buttons**: primary = `Button`; secondary = `Button variant="secondary"`; compact table buttons = `size="sm"`; inline buttons always `fullWidth={false}`; non-table buttons ≥ 44 px tall.
- **Form controls**: existing `Input`/`Select`/`Textarea`. Date → `<input type="date">`, time → `<input type="time">`. Day on/off checkbox on Availability → native checkbox `h-[22px] w-[22px] accent-brand-700` with `aria-label`.
- **Hint box**: dashed `border-brand-600`, `bg-brand-50`, `text-brand-800`, `rounded-xl px-4 py-3`. **Warning card variant** (allergies): `border-amber-400 bg-amber-50`.
- **Responsive**: multi-column areas stack below `lg`; tables scroll horizontally inside their card; the sidebar uses the existing mobile drawer.
- **Dates and times**: 24-hour, short form `Thu 27 Nov · 10:30`, via `Intl.DateTimeFormat` + `formatToParts` in the **hospital timezone** (from `hospital.timezone`, default `Asia/Karachi`) with **Latin digits in both languages** (`en-GB` and `ur-PK-u-nu-latn` locales). Tokens, ids, times, Rx numbers are wrapped in `dir="ltr"`.
- **Every screen has loading, empty and error states** (loading text `common.loading`; error = `Alert` + a `Try again` button; empty = the muted sentence given per screen).

---

## 3. Architecture decisions (already made — implement as written)

1. **Doctor portal = nested routes under `DashboardLayout`**, all wrapped in `<ProtectedRoute role="doctor">`. A `DoctorShell` wrapper loads the doctor profile and hospital info once, exposes them through `DoctorContext` (`useDoctorContext()` → `{profile, hospital}`), and renders `DashboardLayout`.
2. **One service object, two implementations.** `services/doctorPortalService.js` exports the same methods for both modes and chooses at module load: `import.meta.env.VITE_DOCTOR_API_MODE === "mock"` → the in-memory implementation from `data/mockDoctorPortal.js` (loaded with a dynamic `import()` so it is **not** in the live bundle path), otherwise the real axios implementation. `frontend/.env.example` gets `VITE_DOCTOR_API_MODE=mock` with a comment (`mock` until the backend ships, then `live`). In mock mode show a small fixed, non-blocking chip at the bottom-start of the page: `Demo data — mock API` (`doctor.mockChip`).
3. **The contract (§4) is the single source of truth.** Real and mock implementations must return identical shapes and throw identical errors.
4. **All "now" decisions are server-side.** Responses carry `server_now`; the frontend computes `serverOffset = Date.parse(server_now) − Date.now()` at fetch time and only counts down from it.
5. **Live queue = polling every 10 s** while `document.visibilityState === "visible"` plus an immediate refetch after every action. No websockets.
6. **PDF = print documents**: A4 HTML templates printed with `window.print()` ("Save as PDF" in the browser's print dialog). **Print** and **Download PDF** buttons use the same flow; the print window `<title>` is the document number (e.g. `Rx-1042`) so the saved file has a sensible name. Printed documents are **always English, left-to-right**, even when the UI is Urdu (fonts: Lato + Noto Naskh Arabic fallback for Urdu patient names).
7. Authentication stays the existing one (real login → JWT). In mock mode the doctor identity comes from the logged-in user: `profile = {id: user.id, full_name: user.full_name, department: "Cardiology", specialty: "Cardiologist"}` (mock only).

---

## 4. API contract (what the frontend consumes — implement the client and the mock to this exactly)

Base = `api` (axios). All routes below are prefixed `/doctor`. All JSON is **snake_case**. Datetimes are ISO-8601 UTC strings (`2026-11-27T05:30:00Z`); dates are `YYYY-MM-DD`; times are `HH:MM` in hospital local time. Errors: HTTP error with `response.data.detail = "CODE"`; the service wraps them as `Object.assign(new Error(code), {code, status})`. A helper `errorText(t, err)` returns `t("doctor.errors." + code)` when that key exists, else `t("auth.errors.generic")` (network error → `t("auth.errors.network")`).

### 4.1 Endpoints
```
GET  /doctor/profile           -> {id, full_name, department|null, specialty}
GET  /doctor/hospital-info     -> {name, address, phone, email, open_hours, timezone, grace_minutes}   (strings may be "")
GET  /doctor/dashboard         -> {server_now,
                                   stats:{total_patients, appointments_today, in_queue_now,
                                          today_breakdown:{in_progress, waiting, later},
                                          next_waiting:{token_no, patient_name}|null},
                                   today:[appointment_row], upcoming:[appointment_row],
                                   schedule:[schedule_day x7], recent_tests:[lab_row x<=3], recent_prescriptions:[rx_row x<=3]}
GET  /doctor/queue             -> {server_now, grace_minutes, counts:{all,waiting,in_progress,completed,incomplete},
                                   items:[queue_item], expected:[expected_item]}
GET  /doctor/appointments/{id} -> appointment_detail
POST /doctor/appointments/{id}/check-in                      -> 200 queue_item
PATCH /doctor/appointments/{id}/visit-status {visit_status}  -> 200 appointment_detail   (visit_status: "in_progress"|"completed"|"incomplete")
POST /doctor/appointments/{id}/prescriptions {items:[{medicine,dosage,timing}], duration_days, instructions} -> 201 rx_detail
GET  /doctor/prescriptions?q=&from=&to=&limit=25&offset=0    -> {items:[rx_row], total}
GET  /doctor/prescriptions/{id}                              -> rx_detail
GET  /doctor/patients?q=&limit=25&offset=0                   -> {items:[patient_row], total}
GET  /doctor/patients/options                                -> [{id, full_name, age}]
GET  /doctor/patients/{id}                                   -> patient_profile
GET  /doctor/patients/{id}/summary-base?appointment_id=      -> {snapshot, past_appointments}          (always available, no AI)
POST /doctor/patients/{id}/summary?appointment_id=           -> {id, created_at, fields:{10 keys}, cached}  (AI; may fail with 503 SUMMARY_UNAVAILABLE)
GET  /doctor/schedule                                        -> {days:[schedule_day x7, Monday first]}
PUT  /doctor/schedule {days:[schedule_day x7]}               -> {days:[schedule_day x7]}
GET  /doctor/lab-tests                                       -> [{id, name, kind, prep_note}]
GET  /doctor/lab-reports?status=&limit=25&offset=0           -> {items:[lab_row], total}
POST /doctor/lab-reports {patient_id, test_id, notes?, appointment_id?} -> 201 lab_row
GET  /doctor/lab-reports/{id}                                -> lab_detail
GET  /doctor/lab-reports/{id}/files/{file_id}                -> binary (use responseType "blob")
```
### 4.2 Shapes
- `appointment_row {id, starts_at, patient_id, patient_name, patient_age|null, reason|null, status, visit_status, queue_state, token_no|null}` — `status ∈ pending|confirmed|completed|cancelled`, `visit_status ∈ scheduled|in_progress|completed|incomplete`, `queue_state ∈ in_progress|waiting|holding|later|grace_expired|completed|incomplete|none` (`none` = not part of today's queue, e.g. pending or future day).
- `queue_item = appointment_row + {position|null, checked_in_at|null, called_at|null, completed_at|null, grace_ends_at|null, can_call (bool), call_blocked_reason: null|"in_progress"|"held"|"not_next", blocked_by_name|null}`.
- `expected_item {id, patient_name, starts_at, grace_ends_at|null, expected_state: "holding"|"later"|"grace_expired"}`.
- `appointment_detail {id, booking_no, token_no|null, starts_at, checked_in_at|null, called_at|null, completed_at|null, status, visit_status, queue_state, reason|null, source: "portal"|"chatbot", room_label, patient:{id, full_name, age|null, gender|null}, prescriptions:[rx_row], lab_reports:[lab_row]}`.
- `rx_row {id, rx_no, patient_id, patient_name, issued_on, duration_days, status}` — `status` is the **effective** status `active|completed|cancelled`.
- `rx_detail {…rx_row, doctor:{name, department|null}, patient:{name, age|null, gender|null}, appointment:{id, booking_no, starts_at, token_no|null, room_label}|null, items:[{medicine,dosage,timing}], instructions}`.
- `patient_row {id, full_name, age|null, gender|null, last_visit|null, active_rx_count, next_appointment|null}` (dates are ISO datetimes).
- `patient_profile {id, full_name, age|null, gender|null, email, prescriptions:[rx_detail-without-appointment-block… i.e. {id, rx_no, issued_on, duration_days, status, doctor_name, items:[…], instructions}] (all doctors), appointments:[{id, starts_at, doctor_name, department|null, status, visit_status, token_no|null, booking_no}] (newest first, max 50)}`.
- `summary-base`: `snapshot {name, age|null, gender|null, last_visit:{starts_at, department|null}|null}`, `past_appointments:[{doctor_name, department|null, starts_at, status}]` (3 items).
- `summary fields` keys: `patient_overview, chief_complaint, medical_history, surgical_history, medications, allergies, family_history, social_history, vitals_and_results, assessment_and_plan` (strings; the literal `Not documented in the provided records` means no data).
- `schedule_day {weekday (0=Mon…6), is_active, start_time|null, end_time|null, slot_minutes (15|30|45), room_label}`.
- `lab_row {id, report_no, test_name, kind: "lab"|"radiology", patient_id, patient_name, status: "requested"|"scheduled"|"in_progress"|"ready"|"cancelled", created_at, scheduled_for|null}`.
- `lab_detail {…lab_row, notes, results:[{test,result,unit,reference,flag: "normal"|"high"|"low"}], findings, impression, comments, reported_by_name, files:[{id, kind:"image"|"pdf", caption}]}`.

### 4.3 Error codes (HTTP → i18n key `doctor.errors.<CODE>`)
`NOT_FOUND` 404 · `ALREADY_CHECKED_IN`, `NOT_TODAY`, `NOT_CHECKED_IN`, `INVALID_TRANSITION`, `ALREADY_IN_PROGRESS`, `QUEUE_HELD`, `NOT_NEXT`, `VISIT_NOT_IN_PROGRESS` 409 · `SCHEDULE_INVALID` 422 · `SUMMARY_UNAVAILABLE` 503. Each needs an English and Urdu message. A patient the doctor has no relationship with always returns `NOT_FOUND`; every screen that loads by id must show a friendly not-found state (`This page is not available.` + a back link).

### 4.4 Domain rules the backend will implement — the **mock must reproduce them exactly**, and the UI logic is built around the resulting fields
**Queue** (today in `hospital.timezone`; grace = `grace_minutes`, default 5). Only appointments starting today with `status ∈ {confirmed, completed}` are considered.
| Condition | `queue_state` |
|---|---|
| `visit_status = completed` | `completed` |
| `visit_status = incomplete` | `incomplete` |
| `visit_status = in_progress` | `in_progress` (position locked) |
| `scheduled` and `checked_in_at` set | `waiting` |
| `scheduled`, not checked in, `starts_at ≤ now < starts_at + grace` | `holding` (`grace_ends_at = starts_at + grace`) |
| `scheduled`, not checked in, `now ≥ starts_at + grace` | `grace_expired` |
| `scheduled`, not checked in, `now < starts_at` | `later` |
- **Waiting order** = ascending `(effective_time, checked_in_at, id)`, `effective_time = starts_at` if `checked_in_at ≤ starts_at + grace`, else `checked_in_at`. (Earlier-scheduled patient who checks in within grace gets priority; a late check-in after grace is placed by check-in time; an expired no-show simply does not block anyone.)
- A waiting patient `w` is **blocked** when a `holding` patient `h` has `h.starts_at ≤ w.effective_time` (`blocked_by_name = h`).
- `position` (1-based) is given to `in_progress` first (ordered by `called_at`), then `waiting`; all other states `null`.
- `can_call` (waiting only) = first waiting entry AND not blocked AND nobody `in_progress`. `call_blocked_reason` otherwise, checked in this order: `in_progress`, `held`, `not_next`.
- `items` = `in_progress`, then `holding` and `waiting` merged by their position order (a `holding` entry sits where its `starts_at` places it among the `effective_time`s), then `completed`/`incomplete` by `completed_at`. `later` and `grace_expired` are **only** in `expected` (sorted by `starts_at`, together with `holding`).
- `counts.all = items.length`; `counts.waiting` counts only `waiting`. Dashboard `in_queue_now` = `in_progress` + `waiting`.

**Transitions** (`PATCH visit-status`): checked-in `scheduled` → `in_progress` (requires `can_call`, else 409 `ALREADY_IN_PROGRESS` / `QUEUE_HELD` / `NOT_NEXT` per `call_blocked_reason`) or `incomplete`; `in_progress` → `completed` or `incomplete`; not checked in → 409 `NOT_CHECKED_IN`; `completed`/`incomplete` → 409 `INVALID_TRANSITION`; non-today → 409 `NOT_TODAY`. `in_progress` sets `called_at`; `completed` sets `completed_at` and `status="completed"`; `incomplete` sets `completed_at` and leaves `status="confirmed"`. **Check-in**: only `status="confirmed"`, today, `scheduled`, not yet checked in (409 `ALREADY_CHECKED_IN` / `NOT_TODAY` / `INVALID_TRANSITION`); early check-in is allowed.

**Prescriptions**: created only while the appointment is the doctor's and `in_progress` (else 409 `VISIT_NOT_IN_PROGRESS`); 1–10 items; `medicine` ≤ 100, `dosage` ≤ 60, `timing` ≤ 80 chars; `duration_days` 1–365; `instructions` ≤ 1000. `rx_no` = `Rx-{n}` (`n = max(1000, highest existing) + 1`). Effective status: stored `active` becomes `completed` once `today > issued_on + duration_days`.

**Lab requests**: new report `status="requested"`, `report_no` = `LAB-{n}` (`kind=lab`) / `RAD-{n}` (`kind=radiology`, same numbering rule), `scheduled_for = null`; `notes` ≤ 500; `appointment_id` (optional) must be the doctor's appointment for the same patient.

**Tokens / numbers**: `token_no` = first letter of department (upper-case, `A` fallback) + `-` + 2-digit sequence; `booking_no` = `APT-{id:04d}`.

**Access**: a doctor sees only patients who have a `confirmed|completed` appointment with them; the profile and summary show records of **all** doctors for such a patient; prescription history and the lab-tests list show **only the doctor's own**.

**Schedule**: one window per weekday; `slot_minutes ∈ {15,30,45}`; `start_time < end_time`; slot ≤ window length; `room_label` ≤ 40; exactly 7 unique weekdays else 422 `SCHEDULE_INVALID`. Slot starts = `start, start+m, …` while `slot_end ≤ end` (10:30–12:45 / 45 min → `10:30, 11:15, 12:00`). Saving never touches existing appointments.

---

# PHASE B — Foundation, services, mock

### B1. Shared components (all new props optional; defaults leave the admin portal pixel-identical)
- `Sidebar`: items may carry `icon` (key into a new `components/layout/navIcons.jsx` map of inline SVGs) and `matchPaths` (extra path prefixes that also mark the item active, via `useLocation`). New optional props `portalLabel` (string under the logo) and `userCard={{ name, subtitle }}`. Items with `icon` use the portal item style (§2); with `userCard` render the bottom user card instead of the text Log out button. Without these props nothing changes.
- `DashboardLayout`: new optional `variant="portal"` (+ pass-through `portalLabel`, `userCard`). In `portal` variant the top bar is `lg:hidden` (menu button + `LanguageSwitch` on mobile) because the language pill moves into the page title row on `lg+`. Default variant unchanged.
- `PageHeader`: new optional `actions` (node before the language pill) and `showLanguage` (renders `LanguageSwitch` at the end of the title row on `lg+` only: `hidden lg:block`).
- `Tabs`: `variant="pill"`. `StatCard`: optional `detail` (muted line under the label). `DataTable`: optional `dense` (cells `px-2 py-3`) and `onRowClick` (row `cursor-pointer hover:bg-brand-50`, `tabIndex=0`, Enter activates).
- New `components/common/InfoGrid.jsx` (§2).
- `utils/format.js` additive: `fill(template, values)`. New `utils/datetime.js`: `formatShort(iso, lang, tz)` → `Thu 27 Nov · 10:30`; `formatTime(iso, tz)` → `10:30`; `formatDate(iso, lang, tz)` → `12 Nov 2026`; `formatDay(iso, lang, tz)` → `Thursday, 27 November`; `mmss(ms)` → `2:00` (never negative); `dayPart(nowMs, tz)` → `morning|afternoon|evening` (<12, <17, else). All via `Intl.DateTimeFormat(...).formatToParts`, `hourCycle:"h23"`, Latin digits. New `utils/schedule.js`: `expandWindow(start, end, slotMinutes) → ["10:30", …]` (same algorithm as §4.4) and `validateDay(day)` returning an error key or `null`.

### B2. Routing and shell
- `config/doctorNav.js` → `DOCTOR_NAV`: `/doctor` (Dashboard, `end`, `matchPaths:["/doctor/availability"]`), `/doctor/queue`, `/doctor/prescriptions`, `/doctor/patients`, `/doctor/lab-tests`, with icons (dashboard grid, two people, "Rx", person, flask — same shapes as the mockup sidebar).
- `components/doctor/DoctorShell.jsx` + `context/DoctorContext.jsx` (§3.1). While loading `common.loading`; on failure `Alert` + retry. Renders `<DashboardLayout variant="portal" navItems={DOCTOR_NAV} portalLabel={t("doctor.portalLabel")} userCard={{name: profile.full_name, subtitle: profile.department || ""}} />`.
- In `AppRoutes.jsx` **replace** only the `/doctor` placeholder route with:
```
<Route path="/doctor" element={<ProtectedRoute role="doctor"><DoctorShell/></ProtectedRoute>}>
  <Route index element={<DoctorDashboard/>} />
  <Route path="availability" element={<DoctorAvailability/>} />
  <Route path="queue" element={<DoctorQueue/>} />
  <Route path="queue/:appointmentId" element={<DoctorAppointment/>} />
  <Route path="queue/:appointmentId/summary" element={<DoctorSummary/>} />
  <Route path="queue/:appointmentId/prescription/new" element={<DoctorWritePrescription/>} />
  <Route path="prescriptions" element={<DoctorPrescriptions/>} />
  <Route path="patients" element={<DoctorPatients/>} />
  <Route path="patients/:patientId" element={<DoctorPatientProfile/>} />
  <Route path="patients/:patientId/summary" element={<DoctorSummary/>} />
  <Route path="lab-tests" element={<DoctorLabTests/>} />
</Route>
```
Pages live in `src/pages/doctor/`; feature components in `src/components/doctor/`. Leave `/patient` and `/admin` untouched.

### B3. Real service and hooks
`services/doctorPortalService.js`: one method per endpoint of §4.1 (e.g. `getDashboard()`, `getQueue()`, `checkIn(id)`, `setVisitStatus(id, status)`, `createPrescription(appointmentId, body)`, `listPrescriptions(params)`, …), real implementation with `services/api.js`, error wrapping per §4. Hooks in `src/hooks/`: `useDoctorDashboard`, `useDoctorQueue` (polling per §3.5; exposes `{data, loading, error, serverOffset, refresh, checkIn, setVisitStatus}`; every action refetches; clears its timer on unmount), `useDoctorSchedule`. Other screens load with the same `useEffect`/`loading`/`error` shape as `useStaff.js`. All `useEffect`s guard against state updates after unmount (the `active` flag pattern in `useStaff.js`).

### B4. Mock API — `src/data/mockDoctorPortal.js`
Implements **every** method of §4.1 in memory with the same shapes, errors and domain rules of §4.4 (write the queue classification as one pure function `buildQueue(appointments, nowMs, graceMinutes)` inside this file, used by queue/dashboard/appointment endpoints). Simulate latency of 150–350 ms. State lives in module memory (resets on reload). Data is generated **relative to the moment the module loads** (all `confirmed`, today in the hospital timezone; if an offset would cross local midnight, shift the whole day set earlier so every appointment stays today):
- Doctor: from the logged-in user (§3.7). Hospital info: name `CityHospital`, address/phone/email `""`, open hours `Open 24 hours`, timezone `Asia/Karachi`, grace 5.
- Patients (age + gender set): Ayesha Khan (34, female), Bilal Ahmed (52, male), Kamran Ali (60, male), Mariam Siddiqui (45, female), Sidra Aslam (28, female), Usman Tariq (39, male), Zainab Iqbal (31, female) — emails `<first>.<last>@example.com`.
- Today's queue offsets from "now": Kamran −85 min `completed`; Sidra −70 `incomplete`; Bilal −33 `in_progress` (checked in −40, called −22); Zainab −3 not checked in (→ `holding`); Ayesha +12 checked in −6 (`waiting`); Mariam +27 checked in −8 (`waiting`); Usman +57 not checked in (`later`). Tokens like `A-01…A-07` in start order. One pending appointment with this doctor in +2 days; Ayesha also has other-doctor appointments (Dr. Hina Raza, Dermatology, completed 3 weeks ago; Dr. Omar Sheikh, Orthopedics, cancelled; Dr. Imran Qureshi, General Medicine, pending in +5 days).
- Prescriptions by this doctor: `Rx-1042` (Ayesha, issued 12 days ago, 14 days → active; Amlodipine 5 mg · 1 tablet · Morning, after food; Atorvastatin 10 mg · 1 tablet · Night; instructions "Take after food unless stated. Do not stop medicines without asking your doctor. Review after 14 days or sooner if you feel dizzy or unwell."), `Rx-1041` (Bilal, active), `Rx-1038` (Kamran, 25 days ago/14 days → effective completed), `Rx-1030` (Sidra, `cancelled`); plus `Rx-0987` by Dr. Imran Qureshi for Ayesha (completed) visible only in her profile.
- Lab catalogue (all `prep_note: ""` except the **Lipid profile**, which gets the text `Fasting is usually required — follow the lab's instructions.` — mock-only so the hint box can be demonstrated): Complete blood count, Lipid profile, Blood sugar, Liver function, Chest X-ray (`radiology`), ECG. Reports requested by this doctor: CBC (Ayesha, `ready`; Hemoglobin 13.2 g/dL 12.0–15.5, WBC 6.8 ×10³/µL 4.0–11.0, Platelets 245 ×10³/µL 150–450, RBC 4.6 ×10⁶/µL 4.0–5.2, all `normal`, comments "All values are within the reference range. Results should be read together with your clinical history."), Chest X-ray (Ayesha, `ready`, findings "Lungs are clear. Heart size is normal. No pleural effusion. Bony structures are intact.", impression "No acute cardiopulmonary findings.", reported by Dr. Omar Sheikh, no files), Lipid profile (Ayesha, `scheduled`), Liver function (Bilal, `in_progress`), ECG (Kamran, `cancelled`).
- Schedule: Monday 14:00–17:00 / 15 min and Thursday 10:30–12:45 / 45 min, room `Floor 2 · Room 12`; other days off.
- Summary: `summary-base` is computed from the mock data (snapshot + the 3 most recent appointments of that patient by date, newest first, excluding the given `appointment_id`); `POST summary` returns the ten fields built from the mock records (medications from active prescriptions, `vitals_and_results` from ready reports, `chief_complaint` from the appointment reason or `Not documented in the provided records`, `allergies` always `Not documented in the provided records`). Add a dev switch: `localStorage["ch_mock_summary_fail"] = "1"` makes the POST fail with `SUMMARY_UNAVAILABLE` (to test the failure state).
- Mock `POST` writes (check-in, visit status, prescriptions, lab requests, schedule) mutate the in-memory state, apply every validation and error of §4.4, and are visible to subsequent reads.

---

# PHASE C — The screens

Every screen's title row uses `PageHeader` with `showLanguage`. English text below is the `en` value; create keys under `doctor.*`. `{n}`, `{name}` are placeholders for `fill`.

### C1. Dashboard — `/doctor` (`Dashboard.png`)
Title `Good {morning|afternoon|evening}, Dr. {lastName}` (last word of `full_name`, ignoring a leading "Dr."; one-word names are used as is; part of day from server time in the hospital timezone). Subtitle `{Thursday, 27 November} · Here is your day`.
1. **Stat cards** (3 columns, `StatCard` with `detail`): `Total patients` = `stats.total_patients`; `Appointments today` = `appointments_today`, detail `{a} in progress · {b} waiting · {c} later`; `In queue now` = `in_queue_now`, detail `Next: {token} {patient}` or `Nobody waiting` when `next_waiting` is null.
2. **Row** `lg:grid-cols-[2fr_1fr]`. Left card **Appointments** with pill tabs `Today | Upcoming` (switches the list). Row = avatar, bold name, muted `{HH:mm} · {reason or "—"}` (Upcoming: `formatShort`), badge at the end. Badge for **today** by `queue_state` (when `none`, by `status`): `in_progress`→"In progress" success, `waiting`→"Waiting" success, `holding`/`later`/`grace_expired`→"Not arrived" warning, `completed`→"Completed" neutral, `incomplete`→"Incomplete" danger, `status=pending`→"Pending" warning. Upcoming: "Pending"/"Confirmed". Empty: `No appointments today.` / `No upcoming appointments.` Right card **Availability schedule** with `Edit` (`Button size="sm" variant="secondary" fullWidth={false}` → `/doctor/availability`): 7 rows Mon–Sun, short day name (bold, fixed width) + `HH:mm – HH:mm` or muted `Off`, and at the end the slot length `{n} min` (muted, active days only).
3. **Row** `lg:grid-cols-2`: card **Recent requested tests** (table Test / Patient / Date / Status; Date = `created_at` as `27 Nov`; link `View all` → `/doctor/lab-tests`) and card **Recent prescriptions written** (Rx / Patient / Date (`issued_on`) / Status; `View all` → `/doctor/prescriptions`). Empty: `No tests requested yet.` / `No prescriptions written yet.`
Lab status badges: requested/scheduled/in_progress → warning, ready → success, cancelled → danger; labels `Requested | Scheduled | In progress | Ready | Cancelled`. Prescription labels `Active | Completed | Cancelled`.

### C2. Availability — `/doctor/availability` (`Availability.png`)
Title `Availability schedule`, subtitle `Edit your working days, hours and slot length`. One card: heading `Weekly schedule`, help text `Turn a day on, set hours, slot length and room. Slots below are what patients can book.` Table columns: checkbox (day active), `Day` (full name, bold), `From` (time input), `To` (time input), `Slot length` (select `15 min|30 min|45 min`), `Room` (text input, max 40), `Bookable slots` (muted). Inactive days: inputs disabled/empty, slots column `Not working`. Active day: first three slots joined with ` · ` plus ` …` when more (full list in the cell `title`); computed live with `expandWindow`. Turning a day on pre-fills `From 09:00`, `To 13:00`, `15 min` and the room of the last active day if any. Footer (end-aligned): `Reset` (reload server values) and `Save schedule` (primary; disabled until dirty or while invalid). Client validation mirrors §4.4 with inline messages (`End time must be after start time`, `Slot length does not fit in the working hours`). Success → `Alert type="success"` `Schedule saved. Existing appointments were not changed.` (stay on the page). Add `frontend/tests/schedule.test.mjs` with the slot vectors (10:30–12:45/45 → 3 slots; 09:00–10:00/30 → 2; a tail that doesn't fit is dropped).

### C3. Patient queue — `/doctor/queue` (`Patient_queue.png`)
Title `Patient queue`, subtitle `{Thursday 27 Nov} · Patients are served in order of check-in`. Pill tabs (filter the table; counts from `counts`): `All {n}`, `Waiting {n}`, `In progress {n}`, `Completed {n}`, `Incomplete {n}`.
Layout `lg:grid-cols-[2.2fr_1fr]`. Left card **Queue** with the muted note at the end of the heading row `Only patients who checked in at reception appear. Now {HH:mm}` (server time + local ticking, hospital timezone). Table columns: position circle (36 px; `in_progress` solid `brand-700` with a white number; `waiting` `brand-tint` with the number; `holding` `–`; `completed` `✓`; `incomplete` `!`), `Token` (bold), `Patient` (bold `{name} · {age} y` over muted `Scheduled {HH:mm} · Checked in {HH:mm}`; for `holding` the name is `Reserved for {name} · {age} y` and the muted line `Scheduled {HH:mm} · not checked in`), `Status`, `Action` (end-aligned).
- **Status cell**: `in_progress` → success badge `In progress` + muted `Called {HH:mm} · position locked`; first `waiting` (position order) → success `Waiting` + muted `Next in line`; other `waiting` → `Waiting`; `holding` → warning badge `Holding position · grace {m:ss} left` with a **live 1 s countdown** from `grace_ends_at − (Date.now() + serverOffset)` (never negative; when it reaches 0 trigger an immediate refetch) and the **whole row** gets `bg-amber-50` with a dashed amber outline; `completed` → neutral `Completed`; `incomplete` → danger `Incomplete`.
- **Action cell**: `in_progress` → primary sm `Open` (→ `/doctor/queue/:id`) + status `Select`; `waiting` → sm `Call patient` (primary for the first waiting; **disabled** with `title` = translated `call_blocked_reason` when `can_call` is false) + status `Select`; `holding` → sm secondary `Check in`; `completed`/`incomplete` → sm secondary `View` (→ `/doctor/queue/:id`).
- **Status `Select`** (sm, width 150, `aria-label` `Change status`): options `In progress`, `Complete`, `Incomplete` (current label first). `Complete` disabled unless the visit is `in_progress`; `In progress` disabled unless `can_call`. Choosing `Complete`/`Incomplete` opens `ConfirmDialog` (`Mark this visit as complete?` / `Mark this visit as incomplete?`, message `This cannot be undone.`); `In progress` asks nothing. Clicking the row of an `in_progress` patient also opens the appointment page.
- Any action error → `Alert` above the table with `errorText`, then refetch.
Right column: card **Expected, not checked in** (rows from `expected`: avatar, bold name, muted `{HH:mm}` or for holding `{HH:mm} · grace ends {HH:mm}`; at the end `holding` → warning badge with the countdown `m:ss`, `later` → neutral `Later`, `grace_expired` → danger `Expired`; plus a sm secondary `Check in` button for `holding` and `grace_expired`) and card **Grace period** with four muted lines: `{n} minutes after the scheduled time.` / `If an earlier-scheduled patient checks in within it, they get priority.` / `If it expires, the next checked-in patient moves forward.` / `Once you call a patient, their position is locked.` (`{n}` = `grace_minutes`). Empty states: table `Nobody has checked in yet.`; expected `Everyone has checked in.`

### C4. Appointment in progress — `/doctor/queue/:appointmentId` (`Appointment_in_progress.png`)
Breadcrumb link `← Patient queue` above the title. Title `Appointment in progress` when `visit_status='in_progress'`, otherwise `Appointment details`; subtitle `Short appointment detail`. Card 1: header row — large `Avatar`, name (h2) over muted `{age} y · {Gender}`, a success badge `Token {token}`, and at the end a labelled status `Select` (same rules/confirmations as C3; replaced by the status badge for terminal visits). `InfoGrid` (3 cols): `Booking no.`, `Scheduled` (`formatShort`), `Room` (`room_label` or `—`), `Checked in` (`HH:mm`/`—`), `Called` (`HH:mm`/`—`), `Source` (`Portal`/`Chatbot`). Section label `Reason for visit` + the reason or muted `Not provided`. Button row: `View medical history` (primary, large → `/doctor/queue/:id/summary`), `Write prescription` (secondary; **disabled** unless `in_progress`, `title` `Available while the visit is in progress`), `Request test` (secondary → `/doctor/lab-tests?patient={patientId}&appointment={id}`), and `Mark complete` (secondary, at the end; only while `in_progress`; same confirmation). Below, `lg:grid-cols-2`: `Prescriptions for this visit` (rows: Rx no. bold, status badge, sm `View` → `/doctor/prescriptions?rx={id}`; empty `None written yet.`) and `Tests requested for this visit` (rows: test name + status badge; empty `None requested yet.`). A success `Alert` passed through router `state` (from C6) is shown at the top.

### C5. Clinical summary — `/doctor/queue/:appointmentId/summary` and `/doctor/patients/:patientId/summary` (`Clinical_summary.png`)
On the queue route first load `GET /doctor/appointments/{id}` for the patient id. Then call `summary-base` and `POST summary` **in parallel** (pass `appointment_id` on the queue route). While the AI call runs show cards 1 and 6 as soon as `summary-base` returns and skeletons/`Preparing the summary…` in cards 2–5. Breadcrumb `← Appointment {token}` (queue route) / `← Patient profile` (patient route); title `Medical history summary`; subtitle `{name} · {age} y · {Gender}`.
Top notice (hint box): `Auto-generated from the patient's record on {27 Nov · 10:22}. For clinician review. Please verify against the original records.` (date = `created_at` of the AI result).
Six cards (`lg:grid-cols-3`, gap 20 px), card label in section-label style: 1. **Patient snapshot** — name (bold 20 px), `{age} y · {Gender}`, `Last visit: {Tue 4 Nov} · {Department}` or `No previous visit` (from `snapshot`). 2. **Current complaint** — `fields.chief_complaint`; when it clearly contains several items (line breaks or semicolons) render a short list, otherwise a paragraph. 3. **Allergies** — warning card variant; if the value starts with `Not documented` show bold `Not recorded` + muted `Ask the patient and add to the record.`, else the value. 4. **Current medicines** — `fields.medications`. 5. **Recent results** — `fields.vitals_and_results`. 6. **Past appointments** — `{doctor} · {department} · {d Mon} · {Status}` per line (from `past_appointments`). Any field equal to `Not documented in the provided records` renders as muted `Not documented`.
Below the grid an **accordion** `More from the record` (native `<details>`, closed) listing `patient_overview`, `medical_history`, `surgical_history`, `family_history`, `social_history`, `assessment_and_plan` with the same not-documented rule. *(Intentional addition — the summarizer returns these fields.)*
Bottom button row: `← Back to appointment` (secondary; `← Back to profile` on the patient route), `Write prescription` (primary; **queue route only**, **disabled** unless the visit is `in_progress`), and at the end `Print summary`. `Print summary` calls `window.print()` on this page with a `@media print` stylesheet that hides the sidebar, top bars and buttons and shows the hospital header block (same as the PDFs) above the cards.
**Failure** (`SUMMARY_UNAVAILABLE` or network): keep cards 1 and 6 and show in place of cards 2–5 an `Alert`: `The AI summary could not be prepared. Try again in a moment.` with a `Try again` button that re-calls only the POST.

### C6. Write prescription — `/doctor/queue/:appointmentId/prescription/new` (`Write_prescription.png`)
If the visit is not `in_progress`, redirect to the appointment page with an `Alert`. Title `Write prescription`, subtitle `During appointment {token} · {patient}`. One card: `InfoGrid` (3 cols): `Rx number` = `Assigned on save`, `Date issued` (today, `formatDate`), `Appointment` = `{booking no.} · {token}`, `Patient`, `Age / sex` (`34 y · Female`), `Doctor` = `{name} · {department}`. Section `Medicines`: table `# | Medicine | Dosage | Timing | (✕)`, starting with **one empty row**; `+ Add medicine` adds a row (max 10); the remove button (`aria-label` `Remove medicine`) is disabled when one row remains. Fully blank rows are ignored on save; a partly filled row shows inline errors under its empty fields; at least one complete row is required; limits per §4.4. Then `Duration (days)` (number, 1–365, default 14) in a 2-column row and `Instructions` (textarea 4 rows, max 1000) **pre-filled** with `Take after food unless stated. Do not stop medicines without asking your doctor.` (editable; key `doctor.rx.defaultInstructions`). Buttons (end-aligned): `Cancel` (back to the appointment), `Preview PDF` (secondary → print window with the **draft**, D1), `Save prescription` (primary, loading state). Success → navigate to the appointment page with router `state` success message `Prescription {rx_no} saved.`. Show `errorText` for server errors (e.g. `VISIT_NOT_IN_PROGRESS`).

### C7. Prescription history — `/doctor/prescriptions` (`Prescription_history.png`)
Title `Prescription history`, subtitle `Search, filter by date and open any prescription`. Toolbar: search input (placeholder and `aria-label` `Search by patient name`, 300 ms debounce, max-w 340), labelled date inputs `From` / `To`, secondary `Clear filters`. Grid `lg:grid-cols-[1fr_2fr]`. Left card list (row = avatar, bold Rx no., muted `{patient} · {12 Nov 2026}`, status badge; selected row `bg-brand-tint`; newest first; `Load more` secondary button while `items.length < total`). Right card **detail** of the selected prescription: `?rx=<id>` selects it and is kept in sync with the URL (default = first item). Detail = shared `PrescriptionDetail` component: header (label `PRESCRIPTION` + h2 Rx no., status badge, end: `Print` secondary + `Download PDF` primary → both `printPrescription(detail)`); section `Appointment` InfoGrid 4 cols (`Booking no.`, `Date`, `Token`, `Room`; `—` when `appointment` is null); section `Patient` InfoGrid 4 cols (`Name`, `Age / sex`, `Duration` = `{n} days`, `Status`); section `Medicines` table (`Medicine | Dosage | Timing`); section `Instructions`. Empty: `No prescriptions found.`

### C8. Lab tests — `/doctor/lab-tests` (`Lab_tests.png`)
Title `Lab tests`, subtitle `Tests you requested and their results`, header action primary `+ Request test` (scrolls to and focuses the form's Patient select). Pill tabs `All | Requested | Scheduled | Ready` (the `status` filter; other statuses are visible under `All`). Grid `lg:grid-cols-[1.7fr_1fr]`:
- Left card **Requested tests**: table `Test | Patient | Requested | Status | (View)`; `Requested` = `created_at` as `27 Nov`; sm `View` opens a `Modal` (read-only): test name, `report_no`, patient, status badge, requested date, `notes` if any; when `ready`: a results table (`Test | Result | Reference | Flag`; flag badge normal = success, high/low = warning) **or** findings + impression for radiology, plus comments; images (if `files`) fetched via the authenticated endpoint as blobs (`responseType:"blob"` → `URL.createObjectURL`, revoked on close). `Load more` as in C7.
- Right card **Request test** form: `Patient` (`Select` from `/doctor/patients/options`, first option disabled `Select patient`), `Test` (`Select` from the catalogue, first option disabled `Select test`), the **hint box** `Preparation: {prep_note}` **only when the chosen test has a non-empty `prep_note`**, `Notes (optional)` textarea (max 500), buttons `Cancel` (clears) and `Send request` (primary, disabled until patient and test chosen). Query params `?patient=&appointment=` pre-select the patient and attach `appointment_id`; when attached show a muted line `Linked to appointment {token}` (token fetched from the appointment endpoint). Success → `Alert type="success"` `Test requested for {name}.`, form reset, list refetched.

### C9. Patients — `/doctor/patients` (`Patients.png`)
Title `Patients`, subtitle `Click a row to open the patient profile`. Search input `Search patients` (debounced, server-side). One card with `DataTable` (`dense`, `onRowClick` → `/doctor/patients/:id`): `Patient` (avatar + bold name), `Age / sex` (`34 y · F`; translated F/M/O), `Last visit` (`27 Nov` or `—`), `Active Rx` (`active_rx_count`), `Next appointment` (`Thu 27 Nov` or `—`), end column `View ›` in `text-brand-700 font-bold`. `Load more` while more exist. Empty: `No patients yet.`

### C10. Patient profile — `/doctor/patients/:patientId` (`Patient_profile.png`)
Breadcrumb `← Patients`, title `Patient profile`, subtitle `Details, prescriptions and appointments`. Top card (row): 64 px avatar, h2 name, muted `{age} y · {Gender} · {email}`, end buttons `View medical history` (secondary → `/doctor/patients/:id/summary`) and `Print PDF` (primary → `printPatientProfile`). Below, `lg:grid-cols-[1fr_2fr]`: left card **Prescriptions** (all doctors; row: bold Rx no., muted `{12 Nov 2026} · {doctor}`, status badge, sm `View` → `Modal` with the read-only content of `PrescriptionDetail` built from the profile payload — **no extra fetch**, so another doctor's prescription works); right card **Appointments** — 2-column grid of cards (`p-4 rounded-2xl border`): avatar + bold doctor + muted `{Department} · {Thu 27 Nov · 10:30}`, status badge, muted footnote: `confirmed` → `Token {token} · {booking_no}`; `pending` → `Awaiting confirmation`; `completed` → `Visit done`; `cancelled` → `Cancelled`. When `visit_status='incomplete'` the badge reads `Incomplete` (danger) instead of `Confirmed`. Empty: `No prescriptions.` / `No appointments.`

---

# PHASE D — Printable documents (`components/doctor/print/`)

`printWindow.js`: one helper `openPrintWindow({ title, markup, css })` following the evaluation precedent (open the window **synchronously** in the click handler, write a "Preparing…" placeholder, then the final HTML with the Google Fonts link for **Lato** and **Noto Naskh Arabic**, wait for fonts max 2.5 s + 120 ms, `focus()`, `print()`, close the window on failure and log the error). `doctor-print.css` (imported `?inline`): `@page { size: A4 portrait; margin: 0 }`, page = fixed `794×1122 px`, `print-color-adjust: exact`, tokens as in §2. Render documents with `renderToStaticMarkup`. Header data from `useDoctorContext().hospital` (pass it into the print functions): logo block (teal rounded square with `+`, hospital name in brand colour), right-aligned small muted lines `{address or [HOSPITAL ADDRESS]}` / `{phone or [PHONE]} · {email or [EMAIL]}` (each part falls back separately) / `{open_hours}`, then a 4 px `brand-700` rule. Footer: top border, muted small text on the left, `Page 1 of 1` on the right.

### D1. Prescription (`PDF___Prescription.png`) — `printPrescription(detail, hospital, {draft})`
Title `PRESCRIPTION` (centered, bold, letter-spaced 0.3 em, brand colour). `InfoGrid` 3×2: `RX NUMBER`, `DATE ISSUED`, `DURATION` (`14 days`), `PATIENT`, `AGE / SEX`, `DOCTOR` (`Dr. Sana Malik · Cardiology`). Section `MEDICINES` table `# | MEDICINE (bold) | DOSAGE | TIMING`. Section `INSTRUCTIONS`. Bottom block (absolute, above the footer): a 96×96 px **QR placeholder box** (2 px `ink` border, centered text `QR` — no QR library is allowed; keep the placeholder exactly as in the mockup) at the start side and, at the end side, a 240 px signature line with `Doctor's signature & stamp` (muted) and the doctor's name (bold). Footer text `Computer-generated document · Valid with doctor's signature and stamp`. **Draft** (from C6 `Preview PDF`): Rx number reads `Draft`, date = today, window title `Prescription draft`; otherwise window title = Rx number. At most 10 medicine rows fit; the form already caps at 10.

### D2. Patient profile (`PDF___Patient_profile.png`) — `printPatientProfile(profile, doctor, hospital)`
Title `PATIENT PROFILE`. `InfoGrid` 3×2: `PATIENT`, `AGE / SEX`, `EMAIL`, `PRINTED BY`, `PRINTED ON` (today), `DEPARTMENT` (the doctor's). Section `PRESCRIPTIONS` table `RX NO. | DATE | DOCTOR | STATUS`; section `APPOINTMENTS` table `DATE | DOCTOR | DEPARTMENT | STATUS` (date as `Thu 27 Nov · 10:30`). To keep exactly one A4 page: show at most the **10 most recent prescriptions** and **12 most recent appointments**; when truncated add a muted line under the table `Showing the most recent {n}.` Footer `Computer-generated document · Confidential patient information`. Window title `Patient profile - {name}`.

---

# PHASE E — i18n, docs, verification

### E1. i18n
Add all strings (everything in §C/§D, nav labels `Dashboard`, `Patient queue`, `Prescriptions`, `Patients`, `Lab tests`, caption `Doctor portal`, `Demo data — mock API`, short + long weekday names, statuses, `doctor.errors.<CODE>` for every code in §4.3 including the three call-blocked reasons) in `en.js` and `ur.js`, grouped under `doctor.*` (do not touch existing keys). Check the whole portal in RTL: logical classes only; numbers, tokens, times and Rx numbers in `dir="ltr"`; no clipped text; countdown readable.
### E2. Docs and env
`frontend/.env.example`: add `VITE_DOCTOR_API_MODE=mock` with an explanatory comment. Add a short section to the root `README.md` (doctor portal routes, mock vs live mode, where the design PNGs live). Add `docs/design/doctor-portal/README.md` listing the 12 expected PNG names. Add `"test": "node --test tests/"` to `frontend/package.json` scripts (Node's built-in runner; tests are plain `.mjs` files importing the pure utils).

---

# PHASE F — Completeness audit (verify that EVERYTHING in this prompt was actually executed)

After Phases B–E, **stop adding features and audit your own work against this prompt.** Assume you missed things; look for them.

### F1. Traceability matrix — `docs/design/doctor-portal/AUDIT.md`
Create a table with one row for **every** requirement below and give each a status `Done`, `Partial` or `Missing`, the file(s) that implement it, and the **evidence** (command output, screenshot name, or the manual step that proved it):
1. Every route in §B2 exists, is guarded by `ProtectedRoute role="doctor"`, renders inside `DoctorShell`, and has **no placeholder/“coming soon” body left**.
2. Every shared-component change in §B1 (each new prop, `InfoGrid`, `utils/datetime.js`, `utils/schedule.js`, `fill`) exists, is optional, and leaves the admin portal unchanged.
3. Every endpoint of §4.1 has a **real** implementation **and** a **mock** implementation in `doctorPortalService`, with identical shapes (§4.2) and error codes (§4.3). List the 22 endpoints one by one.
4. Every rule of §4.4 is implemented in the mock (queue states, order, blocking, `can_call` reasons, transitions and their effects, prescription limits and numbering, lab-request rules, tokens, access rule, schedule rules).
5. Every screen section C1–C10 and document D1–D2: go through the spec **sentence by sentence** (each label, column, button, badge mapping, empty/loading/error state, query parameter, disabled rule, confirmation dialog, placeholder text, tooltip/`title`, `aria-label`). One row per screen is not enough — list every sub-item that is a separate behaviour.
6. Every i18n key used is defined in **both** `en.js` and `ur.js` under `doctor.*` (see F2 script), including all error codes and every disabled-button reason.
7. Tests exist and pass for the pure utilities and the mock `buildQueue` (§10).
8. Every deviation in §11 is implemented exactly as stated, and nothing else deviates from the PNGs.
9. Security/robustness checklist of §8: tick each line with evidence.
10. Every item of §10's manual walk-through (steps 1–10) has actually been executed and its result recorded.

### F2. Automated consistency script
Write `frontend/scripts/audit-doctor.mjs` (plain Node, **no dependencies**) and add `"audit:doctor": "node scripts/audit-doctor.mjs"` to `package.json`. It must fail (non-zero exit) and print details when any of these is false:
- every literal `t("doctor.…")` / `t('doctor.…')` key found under `src/` exists in `en.js` and in `ur.js`; the `doctor` key sets of `en` and `ur` are identical (no key in one language only, no empty string);
- every method of `doctorPortalService` exists in both implementations (real and mock);
- no source file under `src/pages/doctor` or `src/components/doctor` still uses `doctor.comingSoon`;
- no `console.log`/`debugger` is left in doctor files; no `dangerouslySetInnerHTML`; no `localStorage`/`sessionStorage` use in doctor files except the one dev switch `ch_mock_summary_fail` and the existing session helper;
- no mock data identifiers (patient names such as `Ayesha`, `Bilal`) appear outside `src/data/mockDoctorPortal.js`, tests, the dev-only print page and the README.
Run it and paste the real output in the report.

### F3. Fix and re-audit
Every `Partial`/`Missing` row must be **fixed** and re-verified, then re-run F1/F2 until **no row is Partial or Missing**. If something is genuinely impossible, keep the row as `Blocked`, explain why in one sentence and list it in the report. Also list anything you implemented that this prompt did **not** ask for (extra features are not allowed — remove them, or justify and flag them).

---

# PHASE G — Professional polish and bug sweep (look, formatting, typography, usability)

**Goal:** after everything works, make the doctor portal look and feel like a polished, professional product, and remove bugs. **This is a formatting/quality pass, not a redesign.**

### G0. Hard limits (do NOT do these)
- **Do not change the theme**: no new colors, no new fonts, no changed brand tokens, no changed Tailwind theme values. Use only the existing tokens (`brand-*`, `surface`, `ink`, `ink-muted`, `line`, Lato / Noto Nastaliq).
- **Do not change content**: no rewording, no new or removed copy, no changed labels, no different data, no re-ordered columns/sections, no new features, no removed features. Behaviour stays as specified.
- **Do not change the structure of the mockups**; the PNG remains the visual reference. Polish means getting closer to it and making it consistent, not departing from it.
- **Do not alter the look of the admin portal, login/register, or `/patient`.** Any edit to a shared component or global CSS must be additive/neutral for them; after each such edit compare those screens before/after (same layout, fonts, spacing) and revert the edit if anything changed.
- Scope: the **doctor portal** is the target. Global issues you find elsewhere (e.g. a font that fails to load, an overflow in a shared component) may be fixed **only** if the fix is low-risk and invisible apart from fixing the defect; list every such fix explicitly in the report.
- If you are tempted by an improvement that would change theme/content/structure, **do not apply it** — write it under "Suggestions not applied" in the report.

### G1. Typography and fonts
- Verify the fonts actually load and are used everywhere in the portal: Lato for Latin text, Noto Nastaliq (`font-urdu`) for Urdu UI text, Lato + Noto Naskh Arabic fallback in the printed documents. No fallback serif/system font may be visible on any screen (check headings, buttons, inputs, selects, table cells, badges, tooltips, modals, print windows). `input`, `select`, `textarea` and `button` must inherit the font (browsers do not by default).
- Apply one consistent **type scale** across all doctor screens, using existing Tailwind sizes: page title 32 px black; card/section heading 20 px black; body 16 px; secondary 14 px; section labels 12 px uppercase bold with letter-spacing; big stat numbers 40 px black; consistent weights (400 body, 700 emphasis, 900 titles). Fix any screen that deviates (wrong size/weight/colour for the same role).
- Use `tabular-nums` for every time, count, token, Rx number, countdown and table number column so digits align and do not jitter (the countdown must not change width every second).
- Line-height and Urdu: Nastaliq needs generous line height — make sure Urdu text in buttons, badges, table cells, inputs, headings and tooltips is **never clipped** (top/bottom) and does not make rows or buttons jump in height when switching language. Check Urdu inside `Badge`, `Select` options, pills and the sidebar.
- Text overflow: long names, long reasons, long instructions, long medicine names, long email addresses and long doctor/department names must wrap or truncate **gracefully** (`min-w-0`, `break-words`, `truncate` with a `title` where a single line is required) and never push layout or create horizontal page scroll.
- Numbers, tokens, times, Rx numbers stay `dir="ltr"` inside RTL text; punctuation (`·`, `–`, `…`, `›`) must not flip or detach in RTL; directional glyphs/icons (`←`, `›`) must mirror correctly in RTL (use logical/`rtl:` handling instead of hard-coded arrows where needed).

### G2. Layout, spacing and visual consistency
- One spacing rhythm (multiples of 4 px) for card padding, gaps, row heights, toolbar spacing; identical card radius/border/padding on every screen; consistent heading-to-content distance; consistent table header/cell padding, row height, divider colour and hover state; consistent icon sizes (22 px nav, 16–20 px inline); consistent avatar sizes per context; consistent badge height/padding and tone mapping; consistent button heights (44 px primary, 36 px compact), widths and order (primary action at the end where the PNG shows it); consistent form field heights and label/field gaps; aligned columns and baselines; no stray 1 px misalignments, double borders or uneven gaps.
- Page structure: title row (title + subtitle + actions + language pill) identical on every screen; content max-width and grid gutters consistent; sidebar/user card pixel-consistent with the PNGs.
- No layout shift: skeleton/loading blocks reserve the final size; images in the lab modal reserve their box; buttons do not resize when showing a spinner or when text changes language; the queue table does not jump during polling refreshes (preserve scroll position, keep focus, do not re-mount rows needlessly — stable `key`s).
- Responsive: verify at **360, 390, 768, 1024, 1280, 1440, 1920 px**. No horizontal scrolling of the page, no overlapping or clipped elements, columns stack as specified below `lg`, wide tables scroll **inside** their card, buttons wrap instead of overflowing, the mobile drawer works, modals fit small screens (scroll inside, never off-screen), toolbars wrap cleanly.
- Empty, loading and error states look intentional and consistent (same component/spacing/tone on every screen), not like unstyled text.

### G3. Interaction quality and accessibility
- Visible **focus** on every interactive element (`focus-visible` ring using the existing brand ring), logical tab order, Enter/Space activate buttons and clickable rows, Escape closes modals/dialogs, focus moves into a modal on open and returns to the trigger on close; no keyboard trap. If the shared `Modal`/`ConfirmDialog` lack this, add it **additively** without changing their look.
- Hover/active/disabled/loading states for every button, row and pill; disabled controls look disabled **and** are not focusable/clickable; every disabled action explains why via `title` (as specified); `cursor` is correct everywhere (pointer on clickable, not-allowed on disabled).
- **Double-submit protection**: every mutating action (check-in, status change, save prescription, request test, save schedule) disables its control and shows a loading state while pending, and ignores repeated clicks/Enter.
- Form UX: validation messages appear next to the field, are announced (`aria-invalid`, `aria-describedby`), use the existing error styling, and clear when fixed; Enter in single-line inputs does not submit unrelated forms; numeric/time/date inputs use the right input types and limits (`min`/`max`/`maxLength`).
- Accessibility basics: every icon-only button has an `aria-label`; tables use real `<table>`/`<th scope>` semantics; status changes/errors use `role="alert"`/`aria-live="polite"` appropriately (but the 1 s countdown must **not** be announced every second); images have `alt`; page `<title>`/headings hierarchy sensible (one `h1` per screen); colour is never the only carrier of meaning (badges carry text).
- Contrast: all text meets WCAG AA (4.5:1; 3:1 for large text) in the **existing palette** — check `ink-muted` on white/`surface`/`brand-tint`/amber surfaces, white on `brand-700`, badge text on badge background. If a specific *use* fails, switch that use to an existing darker token (never add colours); report each fix.
- Touch targets ≥ 44×44 px for primary controls on mobile; adequate spacing between adjacent small buttons.

### G4. Bug sweep (functional and technical)
Hunt for and fix, with evidence:
- Browser console: **zero errors and zero warnings** on every doctor screen in both languages, in dev and after `npm run build && npm run preview` (React key warnings, invalid DOM nesting such as `<div>` in `<p>` or `<tr>` issues, unknown props, `act`/StrictMode double-effect side effects, failed font/network requests, 404s for assets, unhandled promise rejections).
- Effects and timers: no memory/timer leaks (polling, countdown tick, debounce timers, object URLs revoked, event listeners removed); effects are idempotent under React StrictMode (no duplicate mutations, no double polling).
- **Race conditions:** stale responses must never overwrite newer ones (search/typing, filter changes, fast navigation, polling vs. action refetch) — ignore out-of-date requests with a request counter/abort; unmounted components never set state.
- Navigation: browser back/forward, page refresh and direct deep links work for every route (`?rx=`, `?patient=&appointment=`, `/doctor/queue/:id/summary`); the active sidebar item is right on every nested route; leaving a screen with unsaved changes (Availability, Write prescription) either warns or at least never loses data silently on in-app navigation of the same page.
- Session: a 401 mid-session returns to login without a crash; logout works from every screen; the doctor role guard works (a patient/admin visiting `/doctor` is redirected as the existing guard does).
- Edge data: zero rows, one row, hundreds of rows, very long strings, missing optional fields (`age`, `gender`, `reason`, `token_no`, `room_label`, `email`, department `null`), midnight/timezone boundaries, a countdown that reaches 0 while the tab was hidden, polling resuming after the tab becomes visible, simultaneous status changes. Nothing shows `undefined`, `null`, `NaN`, `Invalid Date` or `[object Object]` anywhere.
- Formatting correctness: dates/times always in the hospital timezone with Latin digits and 24 h format, pluralisation/units (`1 day` vs `14 days` only if the spec's strings allow it — otherwise keep the spec's strings), no raw i18n keys visible (search the UI for text containing `doctor.`), no placeholder strings leaking.
- Build quality: `npm run build` has **no warnings** you introduced; no unused imports/variables/files left; no dead code, commented-out blocks or stray `TODO`s in doctor files; consistent file/component naming per the existing codebase.
- Print documents: both A4 documents fit exactly one page at 794×1122, no clipped or overlapping text, fonts loaded before printing, colours preserved, correct page size/margins in the print dialog, no blank second page; test with long names (Urdu and Latin), 10 medicines, 10 prescriptions + 12 appointments.

### G5. How to verify the polish
- Run the app and look at **every** screen in **both languages** at the widths in G2. If you can run a browser or screenshot tool locally **without adding anything to `package.json`**, take before/after screenshots of each screen (store under `docs/design/doctor-portal/qa/` as `<screen>-<width>-<lang>.png`) and compare against the PNG mockups; if you cannot, say so explicitly and do the checks by running the app and by code review — do not claim visual verification you did not perform.
- Re-run the complete §10 walk-through after the polish pass to make sure nothing regressed, and re-run `npm run build`, `npm test`, `npm run audit:doctor`.
- Compare the admin portal, login and `/patient` before and after: they must be visually and functionally identical.

### G6. Definition of done for the whole task
All of the following are true and **proven in the report**: Phase F matrix has no `Missing`/`Partial` rows (only justified `Blocked`); `npm run build`, `npm test`, `npm run audit:doctor` pass; zero console errors/warnings on all doctor screens in EN and UR; every screen matches its PNG at 1440 px and works at 390 px; both PDFs match their PNGs and fit one A4 page; the theme, content and structure are unchanged; admin portal, login and `/patient` are unchanged.

---

# 8. Security / robustness checklist (verify, don't assume)
- Render all text through React (no `dangerouslySetInnerHTML`); print documents are produced by `renderToStaticMarkup`, which escapes text. Never put tokens or patient data in URLs beyond ids; no clinical text in `console` logs.
- Never trust the UI for permissions: disabled buttons are only a hint — handle every server error code gracefully (`errorText`) and refetch.
- Object URLs created for lab images are revoked on modal close/unmount. Timers/intervals/polling are cleared on unmount and paused when the tab is hidden.
- Mock code is not reachable in `live` mode (dynamic import behind the env check) and no mock data/strings appear in live bundles' normal paths.
- No secrets in frontend files.

# 9. Out of scope (do not build)
Any backend/database/API work, booking/rescheduling/cancelling appointments, patient screens, reception UI, notifications, no-show automation, prescription editing/cancelling, lab result entry or upload, billing, websockets, QR code generation, a medicine catalogue/autocomplete, any change to the admin portal, the Medical Assistant or `/patient`.

# 10. Verification (run and report real results; do not claim success without running)
**After Phase B:** `cd frontend && npm run build` passes; the admin portal and `/patient` still load; the doctor placeholder is replaced and the doctor routes render the shell.
**After Phases C–D:** `npm run build` passes; `npm test` passes (covers `utils/datetime.js`, `utils/schedule.js`, `fill`, and the mock `buildQueue` with at least: every state row of §4.4, exact grace boundary = expired, in-grace priority vs after-grace order, blocked/`can_call` reasons, position numbering, counts). Manual walk-through in the browser in **mock mode**, reporting each step (log in with any existing doctor account — e.g. the seeded demo doctor `imran.malik@cityhospital.pk` / role Doctor — the mock adopts that identity):
1. Lands on `/doctor`; sidebar, user card, mobile drawer and logout work; admin login still works; `/patient` unchanged.
2. Dashboard numbers equal the queue; `Edit` opens Availability.
3. Availability: switch Tuesday on, set 09:00–10:00 / 30 min → slots `09:00 · 09:30`; invalid range blocked; save → success; reload keeps it; the page title row shows the language pill, sidebar highlights Dashboard.
4. Queue: Ayesha's `Call patient` is disabled with a reason while Bilal is in progress; mark Bilal `Complete` (confirmation) → Ayesha still disabled while Zainab shows `Holding position`; when the countdown hits 0 Zainab moves to `Expired` in the Expected panel and Ayesha becomes callable; `Check in` Zainab → she is placed **behind** by check-in time; call Ayesha → locked, row opens the appointment page.
5. Appointment page → `View medical history` shows six cards (also test the failure state via the `ch_mock_summary_fail` switch); `Request test` pre-fills the form; `Write prescription` saves `Rx-…` and the appointment lists it; completing the visit disables `Write prescription`.
6. Prescription history: search, date range, `?rx=` selection; Print/Download open the A4 print preview — compare side by side with `PDF___Prescription.png`.
7. Lab tests: request from the form → appears as `Requested`; pick *Lipid profile* → hint box appears; `View` modal on the `ready` CBC and X-ray.
8. Patients → profile → `Print PDF` matches `PDF___Patient_profile.png`; `View` on another doctor's prescription opens without a request.
9. Open `/doctor/patients/999999` → friendly not-found state.
10. Everything again in Urdu/RTL; compare every screen with its PNG at 1440 px and 390 px and list remaining visual differences.
**Later, when the backend ships:** set `VITE_DOCTOR_API_MODE=live` and repeat steps 1–9 against the real API; any difference from §4 is a backend bug, not something to patch in the frontend.

# 11. Intentional deviations from the mockups (confirm in your report)
1. The design-note-like subtitles on the appointment and summary screens are replaced by the real subtitles in §C.
2. Clinical summary: no "See a doctor soon" badge (no data source); extra `More from the record` accordion; Allergies reads `Not recorded` when there is no data.
3. QR boxes are placeholders (no QR library allowed).
4. Lab tests pill tabs include **Requested**.
5. Queue buttons that cannot be used yet are rendered disabled with an explanatory `title`.
6. `Print summary` prints the on-screen summary with a print stylesheet (no separate A4 template exists).
7. Printed documents are English/LTR regardless of the UI language.
8. A small `Demo data — mock API` chip is shown in mock mode only.

# 12. Handoff notes
- **For the backend prompt (written separately):** §4 is the contract; the mock in §B4 is the executable reference for §4.4's rules. Backend must add `summary-base` as a separate endpoint and include `items` + `instructions` in the profile's prescriptions.
- **For the later Patient Portal frontend prompt:** reuse the shell additions of §B1 (`Sidebar` icons/`userCard`, `DashboardLayout variant="portal"`, `PageHeader`, `Tabs variant="pill"`, `StatCard detail`, `DataTable dense/onRowClick`, `InfoGrid`, `datetime.js`, `fill`, `printWindow.js`); patient screens must show lab status `requested` and decide how `visit_status='incomplete'` appears to patients.

---

## Final report (required)
List: every file created/changed; every new shared-component prop; `npm run build` and `npm test` results (real output summary); the manual walk-through result per step in §10 (mock mode); every deviation (§11) and anything you could not verify; every Urdu string you wrote; every point where you stopped because of a conflict (rule 0.6).
Also include: (a) the **Phase F audit summary** — counts of Done / Partial / Missing / Blocked rows (target: no Partial/Missing) and a link to `docs/design/doctor-portal/AUDIT.md`; the real output of `npm run audit:doctor`; (b) the **Phase G polish log** grouped by category (typography/fonts, spacing/layout, responsive, interaction/accessibility, contrast fixes, bugs fixed) with one line per fix and the file touched; (c) every global/shared-component fix made outside the doctor portal and how you proved it is invisible elsewhere; (d) screenshots taken (or an explicit statement that none could be taken); (e) **Suggestions not applied** (anything that would have changed theme/content/structure); (f) remaining known issues.
