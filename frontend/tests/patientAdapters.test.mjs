import test from "node:test";
import assert from "node:assert/strict";
import { appointmentView, dashboardView, hospitalView, labDetailView, labRowView, prescriptionView, tokenSlipView } from "../src/utils/patientAdapters.js";
import { formatWeekdayDate, localDateInput, formatDateLong } from "../src/utils/datetime.js";

const appt = { id: 5, group: "upcoming", booking_no: "APT-0005", starts_at: "2026-11-27T05:30:00Z", doctor_id: 2, doctor_name: "Dr. A", department: "Cardiology", status: "confirmed", visit_status: "scheduled", token_no: "C-01", room_label: "Room 1", can_edit: true, can_cancel: false };

test("appointment adapter formats Karachi time and maps status", () => {
  const v = appointmentView(appt);
  assert.equal(v.time, "10:30"); assert.equal(v.date, "Fri 27 Nov"); assert.equal(v.status, "Confirmed"); assert.equal(v.token, "C-01"); assert.equal(v.canCancel, false);
  assert.equal(appointmentView({ ...appt, status: "weird" }).status, "Cancelled");
});
test("hospital placeholders stay when fields are empty", () => {
  const h = hospitalView({ name: "X", phone: "", email: "", address: "", emergency_number: "", open_hours: "Open 24 hours" });
  assert.equal(h.emergency, "[EMERGENCY NUMBER]"); assert.equal(h.contact, "[PHONE] · [EMAIL]"); assert.equal(hospitalView({ phone: "1", email: "a@b" }).contact, "1 · a@b");
});
test("prescription adapter", () => {
  const v = prescriptionView({ id: 3, rx_no: "Rx-1003", status: "active", issued_on: "2026-11-12", duration_days: 14, doctor_name: "Dr", department: null, patient: { full_name: "Ayesha", age: 34, gender: "female" }, instructions: "n", items: [{ medicine: "M", dosage: "1", timing: "T" }] });
  assert.equal(v.id, "Rx-1003"); assert.equal(v.givenOn, "12 Nov 2026"); assert.equal(v.duration, "14 days"); assert.equal(v.sex, "Female"); assert.equal(v.patientName, "Ayesha"); assert.deepEqual(v.medicines, [{ name: "M", dosage: "1", timing: "T" }]);
});
test("lab adapters: ready vs scheduled vs awaiting scheduling", () => {
  const base = { id: 1, report_no: "LAB-1", test_name: "CBC", kind: "lab", created_at: "2026-11-22T04:00:00Z", scheduled_for: null, performed_at: null };
  assert.equal(labRowView({ ...base, status: "requested" }).scheduledFor, null);
  assert.equal(labRowView({ ...base, status: "in_progress", scheduled_for: "2026-11-28T04:00:00Z" }).status, "Scheduled");
  const d = labDetailView({ ...base, status: "ready", performed_at: "2026-11-22T04:10:00Z", patient: { full_name: "A", age: 3, gender: "male" }, results: [{ test: "Hb", result: "13.2", unit: "g/dL", reference: "12-15", flag: "normal" }, { test: "X", result: "1", unit: "", reference: "", flag: "HIGH" }], files: [] });
  assert.equal(d.status, "Ready"); assert.equal(d.results[0].result, "13.2 g/dL"); assert.equal(d.results[0].flag, "Normal"); assert.equal(d.results[1].flag, "High"); assert.equal(d.results[1].result, "1");
  assert.equal(labRowView({ ...base, kind: "radiology", status: "ready", performed_at: "2026-11-24T03:40:00Z" }).isRadiology, true);
});
test("dashboard adapter + token slip", () => {
  const d = dashboardView({ patient: { full_name: "A" }, hospital: {}, next_appointment: appt, stats: { active_prescriptions: 1, active_medicines: ["M"], ready_results: 0, ready_result_names: [], awaiting_confirmation: 0, next_awaiting: null }, recent_appointments: [appt], lab_results: [{ id: 1, report_no: "L", test_name: "T", kind: "lab", status: "requested", created_at: "2026-11-22T04:00:00Z", scheduled_for: null, performed_at: null }] });
  assert.equal(d.next.token, "C-01"); assert.equal(d.labs[0].awaitingScheduling, true); assert.equal(d.stats.medicines[0], "M");
  assert.equal(dashboardView({ patient: {}, hospital: {}, next_appointment: null, stats: {}, recent_appointments: [], lab_results: [] }).next, null);
  const s = tokenSlipView({ ...appt, patient: { full_name: "A", age: 34 }, hospital: {} });
  assert.equal(s.patient, "A · 34 y"); assert.equal(s.when, "Fri 27 Nov · 10:30");
});
test("date helpers", () => {
  assert.equal(formatWeekdayDate("2026-11-27T05:30:00Z", "en", "Asia/Karachi"), "Fri 27 Nov");
  assert.equal(localDateInput(Date.parse("2026-11-27T20:00:00Z")), "2026-11-28");
  assert.equal(formatDateLong("2026-11-12"), "12 Nov 2026");
});
