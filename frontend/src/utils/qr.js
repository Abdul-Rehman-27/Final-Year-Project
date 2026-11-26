export function buildTokenQrValue({ bookingNo, token }) {
  return `cityhospital:appointment:${bookingNo}:token:${token}`;
}

export function buildPrescriptionQrValue({ rxNo }) {
  return `cityhospital:prescription:${rxNo}`;
}

export function buildReportQrValue({ reportNo }) {
  return `cityhospital:report:${reportNo}`;
}
