import { renderToStaticMarkup } from "react-dom/server";
import css from "./doctor-print.css?inline";
import { openPrintWindow } from "./printWindow.js";

function parts(value, options, timezone) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone || "Asia/Karachi", ...options }).formatToParts(new Date(value));
}
function partValue(dateParts, type) { return dateParts.find((item) => item.type === type)?.value || ""; }
function displayDate(value, timezone) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? `${value}T12:00:00Z` : value;
  const p = parts(date, { day: "2-digit", month: "short", year: "numeric" }, /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? "UTC" : timezone);
  return `${partValue(p, "day")} ${partValue(p, "month")} ${partValue(p, "year")}`;
}
function displayAppointment(value, timezone) {
  const p = parts(value, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, timezone);
  return `${partValue(p, "weekday")} ${partValue(p, "day")} ${partValue(p, "month")} · ${partValue(p, "hour")}:${partValue(p, "minute")}`;
}
function displayGender(value) {
  const normalized = String(value || "").toLowerCase();
  return { male: "Male", female: "Female", other: "Other" }[normalized] || value || "—";
}
function displayStatus(value) {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function appointmentStatus(appointment) {
  if (["completed", "incomplete", "in_progress"].includes(appointment.visit_status)) return appointment.visit_status;
  return appointment.status || appointment.visit_status;
}

function PatientProfileDocument({ profile, doctor, hospital }) {
  const allPrescriptions = profile.prescriptions || [];
  const allAppointments = profile.appointments || [];
  const prescriptions = allPrescriptions.slice(0, 10);
  const appointments = allAppointments.slice(0, 12);
  const todayParts = parts(new Date(), { day: "2-digit", month: "short", year: "numeric" }, hospital?.timezone);
  const printedOn = `${partValue(todayParts, "day")} ${partValue(todayParts, "month")} ${partValue(todayParts, "year")}`;
  const fields = [
    ["PATIENT", profile.full_name],
    ["AGE / SEX", `${profile.age == null ? "—" : `${profile.age} y`} · ${displayGender(profile.gender)}`],
    ["EMAIL", profile.email],
    ["PRINTED BY", doctor?.full_name],
    ["PRINTED ON", printedOn],
    ["DEPARTMENT", doctor?.department],
  ];
  return (
    <main className="print-page print-page--patient-profile" dir="ltr">
      <header className="print-head">
        <div className="print-brand"><span className="print-plus">+</span>{hospital?.name || "CityHospital"}</div>
        <div className="print-contact">
          <div>{hospital?.address || "[HOSPITAL ADDRESS]"}</div>
          <div>{hospital?.phone || "[PHONE]"} · {hospital?.email || "[EMAIL]"}</div>
          <div>{hospital?.open_hours || ""}</div>
        </div>
      </header>
      <h1 className="print-title">PATIENT PROFILE</h1>
      <section className="print-grid patient-profile-grid" aria-label="Patient information">
        {fields.map(([label, value]) => <div className="print-cell" key={label}><small>{label}</small><strong dir={label === "EMAIL" ? "ltr" : "auto"}>{value || "—"}</strong></div>)}
      </section>
      <h2 className="print-section">PRESCRIPTIONS</h2>
      <table className="print-table patient-profile-table">
        <thead><tr><th>RX NO.</th><th>DATE</th><th>DOCTOR</th><th>STATUS</th></tr></thead>
        <tbody>{prescriptions.map((item) => <tr key={item.id}><td dir="ltr"><b>{item.rx_no}</b></td><td>{displayDate(item.issued_on, hospital?.timezone)}</td><td>{item.doctor_name || "—"}</td><td>{displayStatus(item.status)}</td></tr>)}</tbody>
      </table>
      {allPrescriptions.length > prescriptions.length && <p className="patient-profile-truncated">Showing the most recent 10.</p>}
      <h2 className="print-section">APPOINTMENTS</h2>
      <table className="print-table patient-profile-table">
        <thead><tr><th>DATE</th><th>DOCTOR</th><th>DEPARTMENT</th><th>STATUS</th></tr></thead>
        <tbody>{appointments.map((item) => <tr key={item.id}><td dir="ltr">{displayAppointment(item.starts_at, hospital?.timezone)}</td><td>{item.doctor_name || "—"}</td><td>{item.department || "—"}</td><td>{displayStatus(appointmentStatus(item))}</td></tr>)}</tbody>
      </table>
      {allAppointments.length > appointments.length && <p className="patient-profile-truncated">Showing the most recent 12.</p>}
      <footer className="print-foot patient-profile-foot"><span>Computer-generated document · Confidential patient information</span></footer>
    </main>
  );
}

export function printPatientProfile(profile, doctor, hospital) {
  const markup = renderToStaticMarkup(<PatientProfileDocument profile={profile} doctor={doctor} hospital={hospital} />);
  return openPrintWindow({ title: `Patient profile - ${profile.full_name}`, markup, css });
}

export default PatientProfileDocument;
