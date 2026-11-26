import assert from "node:assert/strict";
import test from "node:test";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
const session = await import("../src/services/session.js");

function reset() {
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();
  session.clearSession();
}

test("saves sessions per tab without writing a persistent session", () => {
  reset();
  session.saveSession({ access_token: "token", user: { id: 1 } });
  assert.deepEqual(session.loadSession(), { token: "token", user: { id: 1 } });
  assert.equal(globalThis.localStorage.getItem("ch_session"), null);
});

test("removes stale localStorage sessions instead of migrating them", () => {
  reset();
  globalThis.localStorage.setItem("ch_session", JSON.stringify({ token: "stale", user: { id: 1 } }));
  assert.deepEqual(session.loadSession(), { token: null, user: null });
  assert.equal(globalThis.localStorage.getItem("ch_session"), null);
});

test("clearSession clears both stores and the handoff", () => {
  reset();
  session.saveSession({ access_token: "token", user: { id: 1 } });
  globalThis.localStorage.setItem("ch_session", "old");
  globalThis.localStorage.setItem("ch_session_handoff", "handoff");
  session.clearSession();
  assert.equal(globalThis.sessionStorage.getItem("ch_session"), null);
  assert.equal(globalThis.localStorage.getItem("ch_session"), null);
  assert.equal(globalThis.localStorage.getItem("ch_session_handoff"), null);
});

test("a handoff is consumed once by a new tab", () => {
  reset();
  session.saveSession({ access_token: "token", user: { id: 1 } });
  session.writeHandoff();
  globalThis.sessionStorage = storage();
  assert.deepEqual(session.loadSession(), { token: "token", user: { id: 1 } });
  assert.equal(globalThis.localStorage.getItem("ch_session_handoff"), null);
  globalThis.sessionStorage = storage();
  assert.deepEqual(session.loadSession(), { token: null, user: null });
});

test("ignores and removes expired handoffs", () => {
  reset();
  globalThis.localStorage.setItem(
    "ch_session_handoff",
    JSON.stringify({ session: { token: "token", user: { id: 1 } }, expires: Date.now() - 1 })
  );
  assert.deepEqual(session.loadSession(), { token: null, user: null });
  assert.equal(globalThis.localStorage.getItem("ch_session_handoff"), null);
});

test("handles corrupt session and handoff JSON", () => {
  reset();
  globalThis.sessionStorage.setItem("ch_session", "not-json");
  globalThis.localStorage.setItem("ch_session_handoff", "also-not-json");
  assert.deepEqual(session.loadSession(), { token: null, user: null });
  assert.equal(globalThis.sessionStorage.getItem("ch_session"), null);
  assert.equal(globalThis.localStorage.getItem("ch_session_handoff"), null);
});
