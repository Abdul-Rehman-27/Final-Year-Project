const SLOT_LENGTHS = [15, 30, 45];
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function minutesOf(time) {
  if (!TIME_PATTERN.test(time || "")) return NaN;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function expandWindow(start, end, slotMinutes) {
  const interval = Number(slotMinutes);
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || !SLOT_LENGTHS.includes(interval) || from >= to) return [];
  const result = [];
  for (let time = from; time + interval <= to; time += interval) {
    result.push(`${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`);
  }
  return result;
}

export function validateDay(day) {
  if (!day?.is_active) return null;
  const start = minutesOf(day.start_time);
  const end = minutesOf(day.end_time);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return "doctor.availability.endAfterStart";
  if (!SLOT_LENGTHS.includes(Number(day.slot_minutes)) || end - start < Number(day.slot_minutes)) {
    return "doctor.availability.slotDoesNotFit";
  }
  if (typeof day.room_label !== "string" || day.room_label.length > 40) return "doctor.availability.roomTooLong";
  return null;
}

export const MAX_SESSIONS = 4;
export const MAX_BREAKS = 10;

/** Sessions of a day as the editor sees them (new `sessions` field, else the legacy single window). */
export function daySessions(day) {
  if (Array.isArray(day?.sessions)) return day.sessions;
  if (day?.is_active && day.start_time && day.end_time) {
    return [{ start_time: day.start_time, end_time: day.end_time, slot_minutes: day.slot_minutes || 15, room_label: day.room_label || "" }];
  }
  return [];
}

export function dayBreaks(day) {
  return Array.isArray(day?.breaks) ? day.breaks : [];
}

/** Keeps the legacy fields (= first session) in step with `sessions`, so old clients and mock mode still work. */
export function withSessions(day, sessions, breaks = dayBreaks(day)) {
  const first = sessions[0];
  return {
    ...day,
    is_active: sessions.length > 0,
    start_time: first ? first.start_time : null,
    end_time: first ? first.end_time : null,
    slot_minutes: first ? first.slot_minutes : 15,
    room_label: first ? first.room_label : "",
    sessions,
    breaks: sessions.length ? breaks : [],
  };
}

/** Same rules as the backend: returns { sessions: [key|null...], breaks: [key|null...], day: key|null }. */
export function validateSessionsDay(day) {
  const sessions = daySessions(day);
  const breaks = dayBreaks(day);
  const result = { sessions: sessions.map(() => null), breaks: breaks.map(() => null), day: null };
  if (!day?.is_active) return result;
  sessions.forEach((s, i) => {
    const from = minutesOf(s.start_time);
    const to = minutesOf(s.end_time);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) result.sessions[i] = "doctor.availability.endAfterStart";
    else if (!SLOT_LENGTHS.includes(Number(s.slot_minutes)) || to - from < Number(s.slot_minutes)) result.sessions[i] = "doctor.availability.slotDoesNotFit";
    else if (typeof s.room_label !== "string" || s.room_label.length > 40) result.sessions[i] = "doctor.availability.roomTooLong";
  });
  const order = sessions.map((s, i) => [minutesOf(s.start_time), minutesOf(s.end_time), i]).filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1])).sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < order.length; k += 1) {
    if (order[k][0] < order[k - 1][1]) { result.sessions[order[k][2]] ||= "doctor.availability.sessionsOverlap"; }
  }
  if (sessions.length > MAX_SESSIONS) result.day = "doctor.availability.tooManySessions";
  breaks.forEach((b, i) => {
    const from = minutesOf(b.start_time);
    const to = minutesOf(b.end_time);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) result.breaks[i] = "doctor.availability.endAfterStart";
    else if (!sessions.some((s) => minutesOf(s.start_time) <= from && to <= minutesOf(s.end_time))) result.breaks[i] = "doctor.availability.breakOutside";
  });
  const bo = breaks.map((b, i) => [minutesOf(b.start_time), minutesOf(b.end_time), i]).filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1])).sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < bo.length; k += 1) {
    if (bo[k][0] < bo[k - 1][1]) result.breaks[bo[k][2]] ||= "doctor.availability.breaksOverlap";
  }
  if (breaks.length > MAX_BREAKS) result.day ||= "doctor.availability.tooManyBreaks";
  return result;
}

export function dayHasErrors(day) {
  const r = validateSessionsDay(day);
  return Boolean(r.day) || r.sessions.some(Boolean) || r.breaks.some(Boolean);
}

/** Bookable start times of one session, skipping any slot that touches a break. */
export function sessionSlots(session, breaks = []) {
  const taken = breaks.map((b) => [minutesOf(b.start_time), minutesOf(b.end_time)]);
  return expandWindow(session.start_time, session.end_time, session.slot_minutes).filter((time) => {
    const start = minutesOf(time);
    const end = start + Number(session.slot_minutes);
    return !taken.some(([from, to]) => start < to && from < end);
  });
}
