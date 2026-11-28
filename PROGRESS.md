# Medical assistant redesign - progress

Search the code for `NEW:` / `reply_to` to find the edits.

## Step 1 - chat window (DONE)
Assistant frontend (`medical-assistant/frontend/src`)
- `App.jsx` split: `components/{StandaloneChat,SummaryView,NavButton,Glyph,EmbeddedChat,EmbeddedMessage,HistoryList,ConnectedPill,ClarifyChip,ReplyChip}.jsx`, `hooks/{useChat,useModelStatus}.js`, `lib/{api,i18n,language}.js`.
- Embedded mode (`?embed=cityhospital`) draws only the history card + chat card. Standalone page unchanged.
- `StructuredReply.jsx`: props `bare`, `hideFollowUp` (follow-up question is the dashed clarify chip). Full redesign is step 2.
- Small EN/Urdu dictionary in `lib/i18n.js` (Urdu wording is a draft: please review).
Assistant backend: `reply_to` column on messages (`db.py`), accepted/saved/returned in `api.py`, passed to the model as a system note.
Portal: `PatientChat.jsx`, `PatientLayout.jsx`, `i18n/en.js` + `ur.js`, `reply_to` on `ChatMessage`, migration `v010_chat_reply_to.py`.

## Owner decisions received (2026-11-28)
- Reply chip: approved as built.
- New chat: server conversation only on first message: approved as built.
- Language: NO switching for the chatbot. Detect every message (Urdu / Roman Urdu / English / mixed), reply in the same style, keep context. Layout stays English + LTR. EN | اردو toggle REMOVED from the portal.
- Edit/cancel allowed ANY time before check-in (backend already does this; ignore the "2 hours" line).
- Steps 2, 3, 4 approved in order; tests, README, handoff file and checkpoint zip after each step.

## Step 1 follow-up: iframe height (DONE, verified in browser, 2026-11-28)
- `frontend/src/pages/dashboards/PatientChat.jsx`: removed `h-[calc(100vh-216px)]`. The frame height is now measured: viewport height (visualViewport when present) - frame top - the page's bottom padding. Re-measured on resize, orientation change, visual-viewport change and when the page header changes size.
- Minimum height 480px (`MIN_FRAME_HEIGHT`). Below that the page scrolls instead of squashing the chat.
- Checked with Playwright (`e2e/assistant_height_check.py`) against the real portal + assistant dev servers (API mocked):
  - desktop 1440x900, tablet 820x1180, mobile 390x844: page overflow 0px, chat scrolls inside the frame, no double scrollbar.
  - short screens (1280x640, phone landscape 844x390): hit the 480px minimum, so the page scrolls there.
- Tests: portal `npm test` 38 pass; both `vite build` OK; assistant backend `pytest` 6 pass.
- Test fixes (test code only, no app change): `tests/test_send_message.py` fake model now accepts the `provider/model` options the route already passes, and the history test ignores the trailing system notes. Before this, 3 of 6 failed.

## Owner answers (2026-11-28, second round)
1. Show percentages as bars. 2. Banner shows hospital number + 1122. 3. Mixed Urdu/English: whichever dominates. 4. EN | اردو stays removed. 5. Step 2 follows the mockup; doctor card + slot chips need the connector/booking, so they are steps 3 and 4.

## Step 2 - DONE (browser-checked, 2026-11-28)
- Backend `api.py`: prompt asks for `possible_causes: [{name, percent}]` and forbids phone numbers; `clean_causes` validates (clamp 0-100, scale if total > 100, old strings kept with percent null); `structured_to_text` shows "Name (58%)".
- Language: `language_of` counts words (Urdu script / Latin / Roman Urdu list, ~150 words), dominant style wins; `language_is_unclear` + `detect_language` ask the model only for close calls and fall back to the word counts on any failure. New `tests/test_language.py`.
- Frontend `StructuredReply.jsx` (`bare` mode): coloured banner (red / amber / green) with level + reason + call line, "POSSIBLE CAUSES" bars with %, then condition/symptoms/tips in larger text. Clarify chip unchanged. Standalone page still uses the old compact card (cause objects shown as "Name (58%)").
- `lib/api.js` `fetchHospitalContact()` reads `/patient/hospital` through the portal token; `EmbeddedChat` -> `EmbeddedMessage` -> `StructuredReply` pass `contact`.
- Checks: `e2e/assistant_reply_card_check.py` (7 checks pass), backend pytest 11 pass, portal 38 pass, both builds OK.
- NOT done in step 2 (needs your input / later steps):
  - Model INTENT classifier (symptoms / doctor / booking / record / hospital info): not built. Its only job is routing to the connector, so it moves to step 3, where the routing exists. Language detection already has its model fallback.
  - Doctor card ("Book now") and slot chips from the mockup: steps 3 and 4.
- Added by me, easy to remove: the small "Rough estimates only, not a diagnosis." note under the bars (labels.estimate in `StructuredReply.jsx`).
- Urdu / Roman Urdu wording of the banner call line and estimate note is a draft: please have a native speaker review.

## Owner decisions for step 3 (2026-11-28)
Connector = assistant reads the portal database by SQL (copies slot rules). Doctor card + slot chips show REAL data but "Book now" / slot chips are DISABLED until step 4. The assistant's own local booking stays (do NOT remove).

## Step 3 - DONE (needs one real-data check)
Backend DONE (19 backend tests pass):
- `app/hospital_connector.py` (read-only SQL): `hospital()`, `doctors()` (active, has department + schedule), `slots(doctor, day, patient)`, `next_slots(...)`. Schedule/slot rules are COPIED from the portal (`services/availability.py`, `services/patient_portal.py`): weekly sessions + breaks, leave / custom_hours / extra_session exceptions, past slots hidden, booked slots hidden (cancelled free them), 30-day window, patient's own overlapping bookings hidden. Karachi time.
- DB URL: new setting `HOSPITAL_DATABASE_URL` (falls back to `SUMMARIZER_DATABASE_URL`, then `MEDICAL_ASSISTANT_DATABASE_URL`). Empty = connector off = old behaviour exactly.
- `api.py`: `connector_reply()` runs before the old data path. Rules route doctor / availability / hospital-info questions; a small model classifier (`classify_intent`) only runs for messages no rule places (and not symptoms / record questions). Any error or no match falls back to the old flow. Pending local booking confirmations ("yes"/"no") never go to the connector.
- New structured reply types: `{"type":"doctors","doctors":[{id,name,department,specialty,date,slots[],room}],"booking_enabled":false}` and `{"type":"hospital","hospital":{name,address,phone,email,open_hours,emergency_number}}`. The plain text answer is saved too.
- Tests: `test_hospital_connector.py` (3), `test_connector_chat.py` (5, includes "local booking still works").
Frontend DONE: `components/DoctorCards.jsx` (doctor card with initials, "Next slot Mon 30 Nov 10:00", disabled "Book now", disabled slot chips, room, note that booking is coming; `HospitalCard`), used by `EmbeddedMessage.jsx`; strings in `lib/i18n.js` (Urdu wording is a draft). Browser-checked with `e2e/assistant_doctor_cards_check.py` (7 checks pass).
Final: backend pytest 19 pass, portal 38 pass, both builds OK.
NOT checked: against a real portal Postgres database (only a SQLite stand-in with the same columns). Please try it once with real data.

## Owner decisions for step 4 (2026-11-28)
Portal does the real writes (existing `/patient/appointments` endpoints, patient taken from the portal session). Token stays inside the iframe as today (chat + hospital phone), booking itself goes through a portal bridge. Typed booking: chat asks yes/no in text, "yes" books via the portal (local test booking is switched off only while the hospital connection + portal bridge are on). Reschedule / cancel: only when the patient types it; chat asks which appointment, then confirms.

## Step 4 - DONE (browser-checked, 2026-11-28)
Flow: patient types -> assistant (`app/portal_flow.py`) asks yes/no in text -> "yes" returns a `portal_action` -> embedded chat asks the portal page by `postMessage` -> portal page calls its OWN `/patient/appointments` endpoints with the signed-in session (all rules applied by the hospital backend) -> chat reports the outcome -> portal relay reads the appointment (token etc.) from its own DB -> assistant words it in the patient's language and shows an appointment card.
Backend (assistant): `portal_flow.py` (new), `api.py` (`portal_bridge` field, flow before old connector path, `POST /chat/sessions/{id}/action-result`, local test booking off while portal is on, doctor cards `booking_enabled` = portal on), `hospital_connector.py` (`appointments()`, `ignore_appointment_id`).
Backend (portal): `routes/chatbot.py` (sends `portal_bridge: true`; new `POST /chat/sessions/{id}/action-result`), `schemas/chatbot.py` (`ActionResultIn`: only action id, ok, appointment id, code).
Frontend (portal): `utils/assistantBridge.js` (validates request, runs book / reschedule / cancel through `patientPortalService`, request id handled once), `PatientChat.jsx` (message handler).
Frontend (assistant): `lib/portalBridge.js`, `hooks/useChat.js` (runs an action only from a reply that just arrived, never from history; 30 s timeout), `DoctorCards.jsx` (slot chips + Book now enabled when `booking_enabled`; `AppointmentCard`), `EmbeddedMessage.jsx`, `EmbeddedChat.jsx`, `lib/i18n.js`.
Behaviour notes:
- Booking by text needs a doctor NAME. Specialty only (e.g. "book a cardiologist") still shows doctor cards (existing behaviour, existing test unchanged). Chip / Book now sends "Book {doctor} on {date} at {time}" and then asks yes / no.
- Reschedule keeps the same doctor (you did not ask for doctor change). Cancel / reschedule offer only editable appointments (active, scheduled, not checked in, not before today).
- Failures show the real portal code plus a readable reason; taken-slot failures also show free times. No answer within 30 s -> "check My appointments before trying again" (avoids double booking).
- Token: still passed into the iframe as before (your choice). Booking itself never uses it from the assistant side.
- Added by me beyond your list (easy to remove): the "Book now" / slot chips are enabled (Step 3 said they would be in step 4); `action_id` single-use check; portal re-reads the appointment from the DB for the card.
Tests: assistant pytest 30 pass (`test_portal_flow.py` 10 new), portal backend pytest 210 pass (`test_chat_actions.py` 5 new), portal `npm test` 43 pass (`assistantBridge.test.mjs` 5 new), both `vite build` OK.
Browser: `e2e/assistant_booking_check.py` (8 checks pass: chip -> yes/no -> portal booking with its own token and only doctor/date/time -> token A025 shown -> refusal code shown -> history reopen does not rebook). Older `assistant_doctor_cards_check.py` (7) and `assistant_reply_card_check.py` (7) still pass. Run all three with both vite dev servers up (5173 portal, 5174 assistant, started with `--host localhost`).
NOT checked:
- Against a real portal Postgres database and the real running portal backend + assistant together (browser check mocks the API; backend tests use SQLite stand-ins). Please try one real booking, one reschedule, one cancel.
- Urdu / Roman Urdu wording of every new message (`TEXT` in `portal_flow.py`, `i18n.js`) is a draft for native-speaker review.
- Reschedule by typed text understands dates like "2026-12-01", "Dec 1", "tomorrow", weekday names and times like "10:30" / "10am"; "10 baje" and other free-form Urdu times are not parsed (the chat asks again).
Possible next questions for you: allow changing the doctor when rescheduling? add yes / no buttons under the confirmation?
