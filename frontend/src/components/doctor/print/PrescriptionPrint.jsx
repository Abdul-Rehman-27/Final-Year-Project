import { renderToStaticMarkup } from "react-dom/server";

import css from "./doctor-print.css?inline";
import { openPrintWindow } from "./printWindow.js";

function issuedDate(value, timezone) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? "UTC" : timezone || "Asia/Karachi",
  }).format(date);
}

function localToday(timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone || "Asia/Karachi",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function PrescriptionDocument({ detail, hospital, draft }) {
  const patient = detail.patient || {};
  const doctor = detail.doctor || {};
  const address = hospital?.address || "[HOSPITAL ADDRESS]";
  const phone = hospital?.phone || "[PHONE]";
  const email = hospital?.email || "[EMAIL]";
  const issuedOn = draft ? localToday(hospital?.timezone) : detail.issued_on;
  const fields = [
    ["RX NUMBER", draft ? "Draft" : detail.rx_no],
    ["DATE ISSUED", issuedDate(issuedOn, hospital?.timezone)],
    ["DURATION", `${detail.duration_days} days`],
    ["PATIENT", patient.name || detail.patient_name],
    ["AGE / SEX", `${patient.age ?? "—"} y · ${patient.gender || "—"}`],
    ["DOCTOR", `Dr. ${doctor.name || ""} · ${doctor.department || "—"}`],
  ];

  return (
    <main className="print-page" dir="ltr">
      <header className="print-head">
        <div className="print-brand"><span className="print-plus">+</span>{hospital?.name || "CityHospital"}</div>
        <div className="print-contact">
          <div>{address}</div>
          <div>{phone} · {email}</div>
          <div>{hospital?.open_hours || ""}</div>
        </div>
      </header>
      <h1 className="print-title">PRESCRIPTION</h1>
      <section className="print-grid" aria-label="Prescription information">
        {fields.map(([label, value]) => (
          <div className="print-cell" key={label}>
            <small>{label}</small>
            <strong dir={label === "RX NUMBER" ? "ltr" : "auto"}>{value || "—"}</strong>
          </div>
        ))}
      </section>
      <h2 className="print-section">MEDICINES</h2>
      <table className="print-table">
        <thead><tr><th>#</th><th>MEDICINE</th><th>DOSAGE</th><th>TIMING</th></tr></thead>
        <tbody>
          {(detail.items || []).slice(0, 10).map((item, index) => (
            <tr key={`${item.medicine}-${index}`}>
              <td>{index + 1}</td><td><b dir="auto">{item.medicine}</b></td><td dir="auto">{item.dosage}</td><td dir="auto">{item.timing}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="print-section">INSTRUCTIONS</h2>
      <p className="print-instructions" dir="auto">{detail.instructions || "—"}</p>
      <div className="print-sign">
        <div className="print-qr">QR</div>
        <div className="print-signature">
          <small>Doctor&apos;s signature &amp; stamp</small>
          <br /><b dir="auto">{doctor.name || ""}</b>
        </div>
      </div>
      <footer className="print-foot">
        <span>Computer-generated document · Valid with doctor&apos;s signature and stamp</span>
        <span>Page 1 of 1</span>
      </footer>
    </main>
  );
}

export function printPrescription(detail, hospital, { draft = false } = {}) {
  const markup = renderToStaticMarkup(
    <PrescriptionDocument detail={detail} hospital={hospital} draft={draft} />,
  );
  return openPrintWindow({
    title: draft ? "Prescription draft" : detail.rx_no,
    markup,
    css,
  });
}
