import { useEffect, useState } from "react";
import { api } from "../lib/api";

const SUMMARY_FIELDS = [
  ["patient_overview", "Patient overview"],
  ["chief_complaint", "Chief complaint"],
  ["medical_history", "Medical history"],
  ["surgical_history", "Surgical history"],
  ["medications", "Medications"],
  ["allergies", "Allergies"],
  ["family_history", "Family history"],
  ["social_history", "Social history"],
  ["vitals_and_results", "Vitals and results"],
  ["assessment_and_plan", "Assessment and plan"],
];

export default function SummaryView() {
  const [file, setFile] = useState(null);
  const [patientRef, setPatientRef] = useState(() => new URLSearchParams(window.location.search).get("patient_id") || "");
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const embedded = new URLSearchParams(window.location.search).get("embed") === "cityhospital";

  useEffect(() => {
    if (!embedded) return undefined;
    const receive = (event) => { if (event.data?.type === "cityhospital-session" && event.data.patientId) setPatientRef(String(event.data.patientId)); };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [embedded]);

  const submit = async (event) => {
    event.preventDefault();
    if (!patientRef.trim()) return;
    let documents = null;
    if (file) documents = [{ name: file.name, content_type: file.type || "application/octet-stream", content_base64: await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); }) }];
    setLoading(true);
    setStatus("Reading record and preparing a grounded summary…");
    try {
      const result = await api("/api/v1/summaries/by-patient", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patient_id: patientRef.trim(), documents }) });
      setSummary(result);
      setStatus(result.usage?.total_tokens ? `Summary ready · ${result.usage.total_tokens} tokens used` : "Summary ready · model token usage not reported");
    } catch (reason) {
      setStatus(reason.message || "Unable to create the summary.");
    } finally { setLoading(false); }
  };

  const field = (key) => summary?.fields?.[key] || "Not documented in the provided records";
  const allergiesMissing = field("allergies").startsWith("Not documented");
  const generated = summary?.generated_at ? new Date(typeof summary.generated_at === "number" ? summary.generated_at * 1000 : summary.generated_at).toLocaleString() : "—";
  const appointments = (summary?.sources || []).filter((source) => /appointment/i.test(source)).join(" · ") || "No past appointments documented";
  const card = (title, content, warning = false) => <article className={`rounded-2xl border p-5 ${warning ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}><h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{title}</h3><div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink">{content}</div></article>;

  return (
    <>
      <style>{"@media print { .summary-controls, .app-nav { display:none!important } body { background:white!important } }"}</style>
      <header className="mb-5"><h2 className="text-3xl font-black text-ink">Medical history summary</h2><p className="mt-1 text-base text-ink-muted">{field("patient_overview")}</p></header>
      <form onSubmit={submit} className="summary-controls mb-5 flex flex-wrap gap-2 rounded-2xl border border-line bg-white p-4"><input value={patientRef} onChange={(event) => setPatientRef(event.target.value)} placeholder="Patient ID" className="rounded-lg border border-line px-3 py-2 text-sm" /><input type="file" accept=".pdf,.txt,.json,.csv,image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} className="text-xs" /><button disabled={loading} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{loading ? "Generating…" : "Generate summary"}</button></form>
      {status && <p role="status" className={`mb-3 text-xs ${summary ? "text-brand-700" : "text-red-700"}`}>{status}</p>}
      {!summary ? <section className="flex min-h-72 items-center justify-center rounded-2xl border border-line bg-white text-sm text-ink-muted">Enter a patient ID to generate a clinician-review summary.</section> : <><div className="mb-5 rounded-xl border border-dashed border-brand-600 bg-brand-50 px-5 py-4 font-semibold text-brand-800">Auto-generated from the patient&apos;s record on {generated}. For clinician review. Please verify against the original records.</div>{summary.warnings?.length > 0 && <div className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{summary.warnings.join(" · ")}</div>}<div className="grid gap-5 lg:grid-cols-3">{card("Patient snapshot", field("patient_overview"))}{card("Current complaint", field("chief_complaint"))}{card("Allergies", allergiesMissing ? <><b>Not recorded</b><br />Ask the patient and add to the record.</> : field("allergies"), allergiesMissing)}{card("Current medicines", field("medications"))}{card("Recent results", field("vitals_and_results"))}{card("Past appointments", appointments)}</div><details className="mt-5 rounded-2xl border border-line bg-white p-5"><summary className="cursor-pointer font-bold text-brand-800">More history</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{SUMMARY_FIELDS.filter(([key]) => !["patient_overview", "chief_complaint", "allergies", "medications", "vitals_and_results"].includes(key)).map(([key, label]) => card(label, field(key)))}</div></details><div className="summary-controls mt-5 flex justify-between"><div>{embedded && <><button onClick={() => window.parent.postMessage({ type: "medical-assistant-back" }, "*")} className="rounded-lg border border-line px-4 py-3 text-sm font-bold">← Back</button><button onClick={() => window.parent.postMessage({ type: "medical-assistant-write-prescription", patientId: patientRef }, "*")} className="ml-2 rounded-lg bg-brand-700 px-4 py-3 text-sm font-bold text-white">Write prescription</button></>}</div><button onClick={() => window.print()} className="rounded-lg border border-line bg-white px-4 py-3 text-sm font-bold">Print summary</button></div></>}
    </>
  );
}
