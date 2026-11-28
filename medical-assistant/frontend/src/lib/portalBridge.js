// Step 4: ask the CityHospital page that embeds this chat to carry out a confirmed booking / move / cancel.
// This app never decides who the patient is and never calls the booking endpoints itself: the portal page does it
// with the signed-in patient's own session and answers with the outcome (appointment id or the portal's error code).
const ACTION_REQUEST = "medical-assistant-portal-action";
const ACTION_RESULT = "cityhospital-action-result";
export const ACTION_TIMEOUT_MS = 30000;

const parentOrigin = new URLSearchParams(window.location.search).get("parentOrigin");

/** Resolves { ok, appointmentId?, code? }. A missing / late answer resolves { ok: false, code: "NO_RESPONSE" } (the change may or may not have happened). */
export function requestPortalAction(requestId, action, params, timeoutMs = ACTION_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!parentOrigin || window.parent === window) {
      resolve({ ok: false, code: "NOT_FOUND" });
      return;
    }
    let timer;
    const finish = (value) => {
      window.removeEventListener("message", receive);
      clearTimeout(timer);
      resolve(value);
    };
    const receive = (event) => {
      if (event.source !== window.parent || event.origin !== parentOrigin) return;
      const data = event.data || {};
      if (data.type !== ACTION_RESULT || data.requestId !== requestId) return;
      finish({ ok: Boolean(data.ok), appointmentId: data.appointmentId ?? null, code: data.code || null });
    };
    window.addEventListener("message", receive);
    timer = setTimeout(() => finish({ ok: false, code: "NO_RESPONSE" }), timeoutMs);
    window.parent.postMessage({ type: ACTION_REQUEST, requestId, action, params }, parentOrigin);
  });
}
