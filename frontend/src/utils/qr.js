export function buildTokenQrValue({ bookingNo, token }) {
  return `cityhospital:appointment:${bookingNo}:token:${token}`;
}

export function buildPrescriptionQrValue({ rxNo }) {
  return `cityhospital:prescription:${rxNo}`;
}

export function buildReportQrValue({ reportNo }) {
  return `cityhospital:report:${reportNo}`;
}

// NEW: used by the doctor "Patient profile" print so it carries a QR like the other documents.
export function buildPatientQrValue({ patientId }) {
  return `cityhospital:patient:${patientId}`;
}
