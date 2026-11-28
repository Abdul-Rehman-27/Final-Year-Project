// Maps patient API payloads onto the shapes the existing patient screens already render.
import { formatDateLong, formatDateTime, formatDayMonth, formatTime, formatWeekdayDate } from "./datetime.js";

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
export const PLACEHOLDERS = { emergency: "[EMERGENCY NUMBER]", address: "[HOSPITAL ADDRESS]", contact: "[PHONE] · [EMAIL]" };

export function hospitalView(h) {
  const contact = [h?.phone, h?.email].filter(Boolean).join(" · ");
  return { name: h?.name || "", emergency: h?.emergency_number || PLACEHOLDERS.emergency, address: h?.address || PLACEHOLDERS.address, contact: contact || PLACEHOLDERS.contact, hours: h?.open_hours || "" };
}

export function personLine(p) { return p ? `${p.full_name}${p.age != null ? ` · ${p.age} y` : ""}` : ""; }

const APPT_STATUS = { confirmed: "Confirmed", pending: "Pending", completed: "Completed", cancelled: "Cancelled" };
export function appointmentView(a, lang = "en") {
  return { id: a.id, group: a.group, bookingNo: a.booking_no, startsAt: a.starts_at, doctorId: a.doctor_id, doctor: a.doctor_name, department: a.department || "", date: formatWeekdayDate(a.starts_at, lang), time: formatTime(a.starts_at), status: APPT_STATUS[a.status] || "Cancelled", token: a.token_no || null, room: a.room_label || "", canEdit: !!a.can_edit, canCancel: !!a.can_cancel, isFollowup: !!a.is_followup };
}

export function tokenSlipView(s, lang = "en") {
  return { token: s.token_no, bookingNo: s.booking_no, status: APPT_STATUS[s.status] || cap(s.status), patient: personLine(s.patient), doctor: s.doctor_name, department: s.department || "", when: `${formatWeekdayDate(s.starts_at, lang)} · ${formatTime(s.starts_at)}`, room: s.room_label || "", hospital: hospitalView(s.hospital) };
}

const RX_STATUS = { active: "Active", completed: "Completed", cancelled: "Cancelled" };
export function prescriptionView(r, lang = "en") {
  return { id: r.rx_no, apiId: r.id, doctor: r.doctor_name, department: r.department || "", age: r.patient?.age ?? "—", sex: cap(r.patient?.gender) || "—", status: RX_STATUS[r.status] || cap(r.status), duration: `${r.duration_days} days`, givenOn: formatDateLong(r.issued_on, lang), patient: personLine(r.patient), patientName: r.patient?.full_name || "", medicines: (r.items || []).map((i) => ({ name: i.medicine, dosage: i.dosage, timing: i.timing })), note: r.instructions || "", hospital: r.hospital ? hospitalView(r.hospital) : null };
}

export const isActiveLabStatus = (s) => s !== "ready";
export function labRowView(r, lang = "en") {
  const when = r.status === "ready" ? (r.performed_at || r.created_at) : (r.scheduled_for || r.created_at);
  return { id: r.id, name: r.test_name, date: formatDayMonth(when, lang), fullDate: formatDateLong(new Date(when).toISOString().slice(0, 10), lang), status: r.status === "ready" ? "Ready" : "Scheduled", rawStatus: r.status, kind: r.kind === "radiology" ? "Radiology report" : "Laboratory report", isRadiology: r.kind === "radiology", reportNo: r.report_no, scheduledFor: r.scheduled_for ? `${formatDayMonth(r.scheduled_for, lang)} · ${formatTime(r.scheduled_for)}` : null };
}

const FLAGS = { normal: "Normal", low: "Low", high: "High", critical: "Critical" };
export function labDetailView(d, lang = "en") {
  return { ...labRowView(d, lang), age: d.patient?.age ?? "—", sex: cap(d.patient?.gender) || "—", patientName: d.patient?.full_name || "", study: d.test_name, performed: d.performed_at ? formatDateTime(d.performed_at, lang) : "", collected: d.performed_at ? formatDateTime(d.performed_at, lang) : "", referredBy: d.referred_by || "—", reportedBy: d.reported_by_name || "", reviewedBy: d.reported_by_name || d.referred_by || "—", pathologist: null, technique: d.technique || "", findings: d.findings || "", impression: d.impression || "", comments: d.comments || "", summary: d.comments || "", radiologist: { name: d.reported_by_name || "", role: "" }, pdf: d.kind === "radiology" ? "radiology-report" : "lab-report", results: (d.results || []).map((r, i) => ({ id: i, test: r.test, result: [r.result, r.unit].filter(Boolean).join(" "), reference: r.reference || "", flag: FLAGS[String(r.flag || "").toLowerCase()] || "Normal" })), files: d.files || [], hospital: d.hospital ? hospitalView(d.hospital) : null };
}

export function dashboardView(d, lang = "en") {
  const s = d.stats || {};
  return { patientName: d.patient?.full_name || "", hospital: hospitalView(d.hospital), next: d.next_appointment ? appointmentView(d.next_appointment, lang) : null, stats: { prescriptions: s.active_prescriptions ?? 0, medicines: s.active_medicines || [], ready: s.ready_results ?? 0, readyNames: s.ready_result_names || [], awaiting: s.awaiting_confirmation ?? 0, nextAwaiting: s.next_awaiting ? appointmentView(s.next_awaiting, lang) : null }, recent: (d.recent_appointments || []).map((a) => appointmentView(a, lang)), labs: (d.lab_results || []).map((r) => { const v = labRowView(r, lang); return { name: v.name, meta: v.status === "Ready" ? v.date : (v.scheduledFor || ""), status: v.status, awaitingScheduling: v.status === "Scheduled" && !v.scheduledFor }; }) };
}
