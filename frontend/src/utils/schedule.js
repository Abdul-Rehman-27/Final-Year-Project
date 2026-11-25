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
