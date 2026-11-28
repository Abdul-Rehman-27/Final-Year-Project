/** Where a doctor notification should take the doctor: the appointment it is about (or null when it has none). */
export function notificationTarget(n) {
  const id = n?.data?.appointment_id ?? n?.data?.source_appointment_id;
  return id ? `/doctor/queue/${id}` : null;
}
