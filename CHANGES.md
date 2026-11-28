# CityHospital – fixes (cancel/preview, empty PDF, doctor QR)

Search the code for `CHANGED` / `NEW:` comments to find every edit.

## 1. Cancel / edit at any time + Preview button
| File | What changed |
|---|---|
| `backend/app/services/patient_portal.py` (~line 19, `editable()` ~line 183) | Removed `CHANGE_CUTOFF_HOURS = 2` and the time check. A visit is editable/cancellable while it is active (pending/confirmed), still `scheduled`, and not checked in. This one function drives `can_edit`, `can_cancel`, the `PATCH /appointments/{id}` and `POST /appointments/{id}/cancel` endpoints. |
| `backend/tests/test_booking_rules.py` | Old test `test_edit_and_cancel_cutoff_two_hours` replaced by `test_edit_and_cancel_allowed_at_any_time_before_checkin`. |
| `frontend/src/pages/patient/PatientAppointments.jsx` (`AppointmentRow`, new `AppointmentDetails`) | "Preview" had no handler (dead button). It now toggles an inline details panel. |
| `frontend/src/i18n/en.js` (`patient.appointments`) | Added `hidePreview` and `details.*` strings. |

## 2. Empty PDF in the print dialog / saved PDF
| File | What changed |
|---|---|
| `frontend/src/components/doctor/print/printWindow.js` | Whole document written in ONE `document.write` (no "Preparing…" then `innerHTML` swap). Google Fonts link no longer blocks rendering. `print()` waits for load -> fonts (max 1.5 s) -> 2 animation frames, runs once. Added an on-screen "Print / Save as PDF" button (hidden in print). |
| `frontend/src/components/doctor/print/doctor-print.css` | Page height 1122px -> 1120px (cannot spill to a 2nd page), `html,body` margin reset, print-only rules, toolbar styles, QR styles. |
| `frontend/src/components/patient/print/PrintShell.jsx` | Removed `.print-page * { break-inside: avoid }` (known cause of empty preview in Chromium/Brave). Page box is now slightly shorter than the paper. Button and `?autoprint=1` both wait for fonts + 2 paints. |

## 3. QR codes in the doctor portal documents
| File | What changed |
|---|---|
| `frontend/src/components/doctor/print/PrescriptionPrint.jsx` (~line 88) | Placeholder `<div>QR</div>` replaced by `QRCodeSVG` using `buildPrescriptionQrValue({ rxNo })` – same value as the patient portal (`cityhospital:prescription:<rx_no>`). Draft previews show a dashed "DRAFT no QR" box. |
| `frontend/src/components/doctor/print/PatientProfilePrint.jsx` (~line 73) | New QR (`cityhospital:patient:<id>`). |
| `frontend/src/utils/qr.js` | New `buildPatientQrValue`. |
| `frontend/src/components/doctor/print/doctor-print.css` | `.print-qr`, `.print-qr-draft`, `.print-qr--profile`. |

## Verification done
- Backend: `pytest tests` -> 205 passed. Frontend: `npm test` 38 passed, `vite build` OK.
- Printed the doctor prescription, draft, patient profile, and the patient token/prescription pages to PDF in headless Chromium: 1 page each, content present; both QR codes decoded back to the expected values.
- NOT verified: Brave's own print dialog on your machine (see the note in the chat reply).
