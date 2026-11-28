import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_REQUEST, ACTION_RESULT, parseActionRequest, rejectedAction, runAction } from "../src/utils/assistantBridge.js";

const ask = (action, params, extra = {}) => ({ type: ACTION_REQUEST, requestId: "r1", action, params, ...extra });

test("only well-formed book / reschedule / cancel requests are accepted", () => {
  assert.deepEqual(parseActionRequest(ask("book", { doctor_id: 10, date: "2026-11-30", time: "10:30" })), { requestId: "r1", action: "book", params: { doctor_id: 10, date: "2026-11-30", time: "10:30" } });
  assert.deepEqual(parseActionRequest(ask("cancel", { appointment_id: 4 })).params, { appointment_id: 4 });
  assert.deepEqual(parseActionRequest(ask("reschedule", { appointment_id: 4, date: "2026-12-01", time: "09:00" })).params, { appointment_id: 4, date: "2026-12-01", time: "09:00" });
  for (const bad of [
    null, { type: "other" }, ask("delete", { appointment_id: 1 }), ask("book", { doctor_id: "10", date: "2026-11-30", time: "10:30" }), ask("book", { doctor_id: 10, date: "30 Nov", time: "10:30" }),
    ask("cancel", { appointment_id: -1 }), ask("cancel", {}), ask("cancel", null), ask("cancel", { appointment_id: 1 }, { requestId: "" }), ask("cancel", { appointment_id: 1 }, { requestId: 5 }),
  ]) assert.equal(parseActionRequest(bad), null);
});

test("extra fields such as a patient id or token are dropped before the call", () => {
  const request = parseActionRequest(ask("book", { doctor_id: 10, date: "2026-11-30", time: "10:30", patient_id: 5, token: "x" }));
  assert.deepEqual(Object.keys(request.params), ["doctor_id", "date", "time"]);
});

test("each action calls the matching patient endpoint and reports only the appointment id", async () => {
  const calls = [];
  const service = {
    bookAppointment: async (body) => { calls.push(["book", body]); return { id: 7, token_no: "A025" }; },
    rescheduleAppointment: async (id, body) => { calls.push(["reschedule", id, body]); return { id }; },
    cancelAppointment: async (id) => { calls.push(["cancel", id]); return { id }; },
  };
  assert.deepEqual(await runAction(parseActionRequest(ask("book", { doctor_id: 10, date: "2026-11-30", time: "10:30" })), service), { type: ACTION_RESULT, requestId: "r1", ok: true, appointmentId: 7 });
  assert.deepEqual(await runAction(parseActionRequest(ask("reschedule", { appointment_id: 4, date: "2026-12-01", time: "09:00" })), service), { type: ACTION_RESULT, requestId: "r1", ok: true, appointmentId: 4 });
  assert.deepEqual(await runAction(parseActionRequest(ask("cancel", { appointment_id: 4 })), service), { type: ACTION_RESULT, requestId: "r1", ok: true, appointmentId: 4 });
  assert.deepEqual(calls, [["book", { doctor_id: 10, date: "2026-11-30", time: "10:30" }], ["reschedule", 4, { date: "2026-12-01", time: "09:00" }], ["cancel", 4]]);
});

test("portal refusals pass their code; unknown outcomes are reported as NO_RESPONSE", async () => {
  const refuse = (code, status) => ({ bookAppointment: async () => { throw Object.assign(new Error(code), { code, status }); } });
  const request = parseActionRequest(ask("book", { doctor_id: 10, date: "2026-11-30", time: "10:30" }));
  assert.deepEqual(await runAction(request, refuse("SLOT_UNAVAILABLE", 409)), { type: ACTION_RESULT, requestId: "r1", ok: false, code: "SLOT_UNAVAILABLE" });
  assert.equal((await runAction(request, refuse("NETWORK", undefined))).code, "NO_RESPONSE");
  assert.equal((await runAction(request, refuse("GENERIC", 500))).code, "NO_RESPONSE");
});

test("a rejected request still answers the frame so it is not left waiting", () => {
  assert.deepEqual(rejectedAction({ requestId: "abc" }), { type: ACTION_RESULT, requestId: "abc", ok: false, code: "VALIDATION_ERROR" });
  assert.equal(rejectedAction({}), null);
});
