import { useEffect, useState } from "react";
import EmbeddedChat from "./components/EmbeddedChat";
import Glyph from "./components/Glyph";
import NavButton from "./components/NavButton";
import StandaloneChat from "./components/StandaloneChat";
import SummaryView from "./components/SummaryView";
import useModelStatus from "./hooks/useModelStatus";
import { setCityHospitalAuth } from "./lib/api";
import { useT } from "./lib/i18n";

const PATIENT_KEY = "medical-assistant-patient-id";
const query = new URLSearchParams(window.location.search);
const embeddedMode = query.get("embed") === "cityhospital";
const parentOrigin = query.get("parentOrigin");

export default function App() {
  const [view, setView] = useState("chat");
  const [embeddedSession, setEmbeddedSession] = useState(null);
  // Decision: the chat interface stays English / left-to-right. Language is detected per message, never switched.
  const t = useT("en");
  const modelStatus = useModelStatus();

  // Accept a patient session (and later language changes) only from the CityHospital page that embedded this app.
  useEffect(() => {
    if (!embeddedMode || !parentOrigin) return undefined;
    const receive = (event) => {
      if (event.source !== window.parent || event.origin !== parentOrigin) return;
      const data = event.data || {};
      if (data.type === "cityhospital-language") return; // intentionally ignored (see decision above)
      if (data.type !== "cityhospital-session" || !data.token || !data.patientId) return;
      setCityHospitalAuth({ token: data.token, patientId: String(data.patientId), apiUrl: data.apiUrl });
      setEmbeddedSession({ patientId: String(data.patientId), patientName: data.patientName || "" });
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "medical-assistant-ready" }, parentOrigin);
    return () => {
      window.removeEventListener("message", receive);
      setCityHospitalAuth(null);
    };
  }, []);

  const [patientId] = useState(() => {
    const existing = localStorage.getItem(PATIENT_KEY);
    if (existing) return existing;
    const created = `patient-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(PATIENT_KEY, created);
    return created;
  });

  // Inside the portal only the two cards are drawn: no sidebar, header, footer or "Response details" panel.
  if (embeddedMode) {
    if (!embeddedSession) return <div className="grid min-h-screen place-items-center font-portal text-sm text-ink-muted">{t("connecting")}</div>;
    return <EmbeddedChat key={embeddedSession.patientId} patientId={embeddedSession.patientId} t={t} modelStatus={modelStatus} />;
  }

  // Standalone page: unchanged layout.
  return (
    <div className="min-h-screen lg:flex">
      <aside className="flex shrink-0 flex-row items-center gap-3 border-b border-line bg-white px-4 py-3 lg:min-h-screen lg:w-64 lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r lg:px-4 lg:py-7">
        <a href="#" onClick={(event) => { event.preventDefault(); setView("chat"); }} className="flex items-center gap-2.5 no-underline lg:mb-12 lg:ml-2"><Glyph className="h-9 w-9 rounded-xl bg-brand-700 text-xl text-white">✚</Glyph><span className="font-bold leading-4 text-ink">Medical<small className="block text-[10px] font-semibold text-ink-muted">Assistant</small></span></a>
        <span className="hidden px-3 text-[10px] font-bold tracking-[1.2px] text-slate-400 lg:mb-3 lg:block">WORKSPACE</span>
        <nav className="ml-auto flex gap-1 lg:ml-0 lg:flex-col">
          <NavButton active={view === "chat"} onClick={() => setView("chat")} icon="◉">Patient chatbot</NavButton>
          <NavButton active={view === "summary"} onClick={() => setView("summary")} icon="▤">Clinical summarizer</NavButton>
        </nav>
        <div className="mt-auto hidden gap-2 rounded-xl border border-line p-3 text-brand-700 lg:flex"><span>⌑</span><div><b className="text-[11px] text-ink">Your care, thoughtfully supported</b><p className="mt-1 text-[10px] leading-4 text-ink-muted">Answers use connected records and cautious AI assistance.</p></div></div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col px-3 sm:px-6 lg:px-9">
        <header className="mb-5 flex h-[88px] shrink-0 items-center justify-between border-b border-line sm:h-[104px]"><div><span className="text-[9px] font-bold tracking-[1.2px] text-slate-400">CITYHOSPITAL · MEDICAL ASSISTANT</span><h1 className="mt-1 text-xl font-bold tracking-tight sm:text-[22px]">{view === "chat" ? "Patient chatbot" : "Clinical summarizer"}</h1></div><div className="flex items-center gap-3"><div className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-[9px] text-ink-muted sm:text-[11px]"><i className={`h-2 w-2 rounded-full ${modelStatus.connected ? "bg-emerald-500" : "bg-amber-500"}`} /><span>{modelStatus.label}</span></div></div></header>
        <div className="flex-1">{view === "chat" ? <StandaloneChat patientId={patientId} /> : <SummaryView />}</div>
        <footer className="mt-3 flex h-10 items-center justify-between text-[8px] text-slate-400 sm:text-[9px]"><span>Medical Assistant Services</span><span>Patient chatbot · Doctor clinical summarizer</span></footer>
      </main>
    </div>
  );
}
