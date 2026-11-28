import api from "./api.js";

function wrap(err) {
  const code = err?.response?.data?.detail;
  const key = typeof code === "string" ? code : err?.request ? "NETWORK" : "GENERIC";
  throw Object.assign(new Error(key), { code: key, status: err?.response?.status });
}
const get = (url, params) => api.get(url, { params }).then((r) => r.data).catch(wrap);
const post = (url, body) => api.post(url, body).then((r) => r.data).catch(wrap);

export const patientPortalService = {
  getProfile: () => get("/patient/profile"),
  getHospital: () => get("/patient/hospital"),
  getDashboard: () => get("/patient/dashboard"),
  listDepartments: () => get("/patient/departments"),
  listDoctors: (department_id) => get("/patient/doctors", department_id ? { department_id } : undefined),
  getSlots: (doctorId, date, exclude_appointment_id) => get(`/patient/doctors/${doctorId}/slots`, { date, ...(exclude_appointment_id ? { exclude_appointment_id } : {}) }),
  listAppointments: () => get("/patient/appointments"),
  bookAppointment: (body) => post("/patient/appointments", body),
  rescheduleAppointment: (id, body) => api.patch(`/patient/appointments/${id}`, body).then((r) => r.data).catch(wrap),
  cancelAppointment: (id) => post(`/patient/appointments/${id}/cancel`),
  getToken: (id) => get(`/patient/appointments/${id}/token`),
  listPrescriptions: () => get("/patient/prescriptions"),
  getPrescription: (id) => get(`/patient/prescriptions/${id}`),
  listLabTests: () => get("/patient/lab-tests"),
  listLabReports: () => get("/patient/lab-reports"),
  getLabReport: (id) => get(`/patient/lab-reports/${id}`),
  bookLabTest: (body) => post("/patient/lab-reports", body),
  listProposals: (status) => get("/patient/reschedule-proposals", status ? { status } : undefined),
  acceptProposal: (id) => post(`/patient/reschedule-proposals/${id}/accept`),
  declineProposal: (id, note) => post(`/patient/reschedule-proposals/${id}/decline`, note ? { note } : {}),
  listFollowups: (status) => get("/patient/followup-recommendations", status ? { status } : undefined),
  acceptFollowup: (id, slot) => post(`/patient/followup-recommendations/${id}/accept`, slot || undefined),
  declineFollowup: (id, note) => post(`/patient/followup-recommendations/${id}/decline`, note ? { note } : {}),
  listNotifications: (unread_only) => get("/patient/notifications", unread_only ? { unread_only: true } : undefined),
  readNotification: (id) => post(`/patient/notifications/${id}/read`),
  readAllNotifications: () => post("/patient/notifications/read-all"),
  getLabFileBlob: (id, fileId) => api.get(`/patient/lab-reports/${id}/files/${fileId}`, { responseType: "blob" }).then((r) => r.data).catch(wrap),
};

/** Translate a service error into patient.errors.<CODE>, falling back to a generic message. */
export function patientErrorKey(err) {
  const code = err?.code;
  if (!code) return "patient.errors.GENERIC";
  return `patient.errors.${code}`;
}
