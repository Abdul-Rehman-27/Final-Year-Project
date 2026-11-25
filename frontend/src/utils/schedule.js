export function expandWindow(start, end, slotMinutes) {
  if (!start || !end || ![15,30,45].includes(Number(slotMinutes))) return [];
  const minutes = (time) => { const [h,m]=time.split(":").map(Number); return h*60+m; };
  const from=minutes(start), to=minutes(end), result=[];
  for (let t=from; t+Number(slotMinutes)<=to; t+=Number(slotMinutes)) result.push(`${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`);
  return result;
}
export function validateDay(day) {
  if (!day.is_active) return null;
  if (!day.start_time || !day.end_time || day.start_time >= day.end_time) return "doctor.availability.endAfterStart";
  if (!expandWindow(day.start_time,day.end_time,day.slot_minutes).length) return "doctor.availability.slotDoesNotFit";
  if ((day.room_label || "").length > 40) return "doctor.availability.roomTooLong";
  return null;
}
