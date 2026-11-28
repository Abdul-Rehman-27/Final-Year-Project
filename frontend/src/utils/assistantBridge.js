// Step 4: the Medical Assistant (inside the iframe) asks this page to book / move / cancel an appointment.
// The page does it with the signed-in patient's own session and the existing patient endpoints, so every portal rule
// (30-day window, max 3 upcoming, slot recheck, ownership, token) is applied by the hospital backend, not by the assistant.
export const ACTION_REQUEST = "medical-assistant-portal-action";
export const ACTION_RESULT = "cityhospital-action-result";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const id = (value) => Number.isInteger(value) && value > 0;

/** Check a request from the frame. Returns { requestId, action, params } with clean values, or null if anything is off. */
export function parseActionRequest(data) {
  if (!data || data.type !== ACTION_REQUEST) return null;
  const { requestId, action, params } = data;
  if (typeof requestId !== "string" || !requestId || requestId.length > 64 || !params || typeof params !== "object") return null;
  if (action === "book" && id(params.doctor_id) && DAY.test(params.date) && TIME.test(params.time)) {
    return { requestId, action, params: { doctor_id: params.doctor_id, date: params.date, time: params.time } };
  }
  if (action === "reschedule" && id(params.appointment_id) && DAY.test(params.date) && TIME.test(params.time)) {
    return { requestId, action, params: { appointment_id: params.appointment_id, date: params.date, time: params.time } };
  }
  if (action === "cancel" && id(params.appointment_id)) return { requestId, action, params: { appointment_id: params.appointment_id } };
  return null;
}

/** Carry the request out through `service` (patientPortalService). Never throws: always returns the message for the frame. */
export async function runAction(request, service) {
  const reply = { type: ACTION_RESULT, requestId: request.requestId };
  try {
    const { action, params } = request;
    const done = action === "book" ? await service.bookAppointment(params)
      : action === "reschedule" ? await service.rescheduleAppointment(params.appointment_id, { date: params.date, time: params.time })
        : await service.cancelAppointment(params.appointment_id);
    return { ...reply, ok: true, appointmentId: done?.id ?? params.appointment_id ?? null };
  } catch (error) {
    // No answer from the server (network error, timeout, server error): the change may or may not have happened.
    const unknown = error?.code === "NETWORK" || error?.code === "GENERIC" || !error?.status || error.status >= 500;
    return { ...reply, ok: false, code: unknown ? "NO_RESPONSE" : String(error.code || "GENERIC") };
  }
}

/** The reply for a request that failed validation, so the frame is not left waiting. */
export function rejectedAction(data) {
  const requestId = typeof data?.requestId === "string" ? data.requestId.slice(0, 64) : "";
  return requestId ? { type: ACTION_RESULT, requestId, ok: false, code: "VALIDATION_ERROR" } : null;
}
