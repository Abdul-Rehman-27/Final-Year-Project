# Medical assistant redesign - progress

Search the code for `NEW:` / `reply_to` to find the edits.

## Step 1 - chat window (DONE, not yet run in a browser)
Assistant frontend (`medical-assistant/frontend/src`)
- `App.jsx` split: `components/{StandaloneChat,SummaryView,NavButton,Glyph,EmbeddedChat,EmbeddedMessage,HistoryList,ConnectedPill,ClarifyChip,ReplyChip}.jsx`, `hooks/{useChat,useModelStatus}.js`, `lib/{api,i18n,language}.js`.
- Embedded mode (`?embed=cityhospital`) draws only the history card + chat card. Standalone page is unchanged (original chat code moved verbatim into `StandaloneChat.jsx`).
- `StructuredReply.jsx`: new props `bare`, `hideFollowUp` (follow-up question is now the dashed clarify chip). Full redesign is step 2.
- `tailwind.config.js`, `index.html`: DM Sans / Urdu font and portal colours; DM Sans only applied inside the iframe.
- Small EN/Urdu dictionary in `lib/i18n.js` (Urdu wording is a draft: please review).
Assistant backend: `reply_to` column on messages (`db.py`), `reply_to` accepted/saved/returned in `api.py`, passed to the model as a system note.
Portal frontend: `PatientChat.jsx` (title + subtitle above iframe, iframe fills page, language sent on load and on change), `PatientLayout.jsx` (EN | اردو toggle top-right), `i18n/en.js` + `ur.js` (`patient.assistant.*`).
Portal backend: `reply_to` on `ChatMessage` model, `SendMessage` schema, route forwards it, migration `v010_chat_reply_to.py` registered in `main.py`.

## Owner decisions received (2026-11-28)
- Reply chip: approved as built (tap the dashed question chip -> "Replying to" chip above the input -> `reply_to`).
- New chat: server conversation only on first message: approved as built.
- Height: wants dynamic/responsive iframe sizing instead of `100vh - 216px`, no double scrolling, chat scrolls internally, works on desktop/tablet/mobile, verified in a running browser. **TODO** (currently still the fixed estimate).
- Language: NO language switching for chatbot. Detect every message (Urdu / Roman Urdu / English / mixed) and reply in the same style; context kept across switches. Layout stays English + left-to-right; no RTL for the app.
  - Done in step 1 follow-up: iframe is always LTR with English labels; the portal language message is ignored; each message uses `dir="auto"` and the Urdu font only when it contains Urdu script.
  - **TODO (backend)**: `language_of()` in `medical-assistant/backend/app/api.py` handles Urdu / Roman Urdu / English per message but not mixed Urdu+English, and uses a short Roman-Urdu word list. Improve with the step-2 model classifier, then test all four cases.
- Steps 2, 3, 4 approved in order; tests, README, handoff file and checkpoint zip after each step; final full test run and production build.

## RESOLVED (owner, 2026-11-28)
- Edit/cancel: allowed ANY time before check-in (matches current backend and `CHANGES.md`). No backend change. The chatbot just follows the backend; ignore the "2 hours" line in decision 7.
- EN | اردو toggle: REMOVED from `PatientLayout.jsx`; `PatientChat.jsx` no longer sends language to the iframe.

## Step 2 - NOT STARTED: amber banner, cause bars, model intent classifier
## Step 3 - NOT STARTED: hospital connector (doctors, slots, hospital info)
## Step 4 - NOT STARTED: book / edit / cancel in chat

## Not verified
No npm/pip packages or network in the working environment, so nothing was built or run. Only Python files were compile-checked and JSX bracket-balance checked.
