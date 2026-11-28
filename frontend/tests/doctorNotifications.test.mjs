import test from "node:test";
import assert from "node:assert/strict";
import { notificationTarget } from "../src/utils/doctorNotifications.js";
import en from "../src/i18n/en.js";
import doctorUr from "../src/i18n/doctorUr.js";

test("a notification opens the appointment it is about", () => {
  assert.equal(notificationTarget({ data: { appointment_id: 7 } }), "/doctor/queue/7");
  assert.equal(notificationTarget({ data: { source_appointment_id: 4, recommendation_id: 2 } }), "/doctor/queue/4");
  assert.equal(notificationTarget({ data: {} }), null);
  assert.equal(notificationTarget(null), null);
});

test("English and Urdu have the same follow-up and notification keys", () => {
  const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
  const enDoctor = en.doctor || en.default?.doctor;
  for (const group of ["notifications", "followup", "followupHistory"]) assert.deepEqual(keys(doctorUr[group]), keys(enDoctor[group]));
  for (const code of ["TOO_FAR_AHEAD", "PATIENT_OVERLAP", "BOOKING_LIMIT_REACHED", "SLOT_UNAVAILABLE", "SLOT_IN_PAST"]) {
    assert.ok(enDoctor.errors[code] && doctorUr.errors[code], code);
  }
});
