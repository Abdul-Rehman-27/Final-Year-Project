import { useCallback, useEffect, useRef, useState } from "react";
import StructuredReply from "./StructuredReply";

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
const PATIENT_KEY = "medical-assistant-patient-id";
const SESSION_KEY = "medical-assistant-session-id";
let cityHospitalAuth = null;

async function api(path, options = {}) {
  let url = path;
  let requestOptions = options;
  // Route embedded chat traffic through CityHospital so the admin usage totals are recorded.
  if (cityHospitalAuth && path.startsWith("/api/v1/chat/sessions")) {
    const apiBase = cityHospitalAuth.apiUrl.replace(/\/+$/, "");
    url = `${apiBase}${path.replace(/^\/api\/v1/, "")}`;
    requestOptions = {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${cityHospitalAuth.token}`,
      },
    };
  }
  const response = await fetch(url, requestOptions);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status})`);
  return payload;
}

function Glyph({ children, className = "" }) {
  return <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center ${className}`}>{children}</span>;
}

function detectLanguage(text = "") {
  return /[\u0600-\u06ff]/.test(text) ? "urdu" : "english";
}

function ChatMessage({ message, onCopy }) {
  const isPatient = message.role === "user";
  const structured = message.structured;
  const content = structured?.type === "message" ? structured.message : message.content || message.answer || "";
  const language = message.language || detectLanguage(content);
  return (
    <article className={`flex max-w-[92%] items-start gap-2.5 ${isPatient ? "ml-auto flex-row-reverse" : ""}`}>
      <Glyph className={`h-7 w-7 rounded-lg text-xs ${isPatient ? "bg-slate-100 text-ink-muted" : "bg-brand-tint text-brand-700"}`}>{isPatient ? "♙" : "✚"}</Glyph>
      <div className="min-w-0">
        {isPatient || !structured || structured.type === "message" ? (
          <div className={`whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-xs leading-6 ${isPatient ? "rounded-tr-sm bg-brand-700 text-white" : "rounded-tl-sm bg-[#f3f8f6] text-[#24413c]"}`}>{content}</div>
        ) : (
          <StructuredReply data={structured} language={language} />
        )}
        <div className={`mt-1 flex items-center gap-2 px-1 text-[9px] text-slate-400 ${isPatient ? "justify-end" : ""}`}>
          <span>{isPatient ? "You" : "Care assistant"}</span>
          {!isPatient && <button onClick={() => onCopy(content)} className="text-ink-muted hover:text-brand-700">Copy</button>}
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }) {
  return <div className="mt-3 flex items-start justify-between gap-3 text-[10px]"><span className="text-ink-muted">{label}</span><b className="text-right font-semibold text-ink">{value}</b></div>;
}

function ChatView({ patientId }) {
  const sessionKey = `${SESSION_KEY}:${patientId}`;
  const [conversationId, setConversationId] = useState(() => localStorage.getItem(sessionKey));
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [responseTime, setResponseTime] = useState(null);
  const [usage, setUsage] = useState(null);
  const [route, setRoute] = useState("—");
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  const loadConversation = useCallback(async (id) => {
    if (id) {
      try {
        const existing = await api(`/api/v1/chat/sessions/${encodeURIComponent(id)}?patient_id=${encodeURIComponent(patientId)}`);
        setMessages((existing.messages || []).map((message) => ({
          ...message,
          language: message.language || detectLanguage(message.content || ""),
        })));
        return id;
      } catch {
        localStorage.removeItem(sessionKey);
      }
    }
    const created = await api("/api/v1/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: patientId }),
    });
    localStorage.setItem(sessionKey, created.id);
    setMessages([]);
    return created.id;
  }, [patientId, sessionKey]);

  useEffect(() => {
    loadConversation(conversationId).then(setConversationId).catch((reason) => setError(reason.message));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, waiting]);
  useEffect(() => {
    if (!waiting) return undefined;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setWaitSeconds((Date.now() - startedAt) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [waiting]);

  const copyMessage = async (value) => {
    try { await navigator.clipboard.writeText(value); }
    catch { setError("Clipboard access is unavailable in this browser."); }
  };

  const submit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || waiting || !conversationId) return;
    setDraft("");
    setError("");
    setMessages((current) => [...current, { role: "user", content: text }]);
    setWaiting(true);
    setWaitSeconds(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await api(`/api/v1/chat/sessions/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patientId, message: text }),
        signal: controller.signal,
      });
      setMessages((current) => [...current, {
        role: "assistant",
        content: result.answer,
        structured: result.structured || null,
        language: result.language || detectLanguage(text),
      }]);
      setResponseTime(result.response_time_ms);
      const count = result.usage?.total_tokens ?? ((result.usage?.prompt_tokens || 0) + (result.usage?.completion_tokens || 0));
      setUsage(count || null);
      setRoute(result.provider === "groq" ? "GroqCloud · GPT-OSS 120B" : result.provider === "ollama" ? `Ollama · ${result.model} (fallback)` : result.provider === "data" ? "Connected hospital data" : "Unavailable");
    } catch (reason) {
      if (reason.name === "AbortError") setMessages((current) => [...current, { role: "assistant", content: "Response stopped. You can ask me again whenever you're ready." }]);
      else setError(reason.message || "The service is unavailable. Please try again.");
    } finally {
      abortRef.current = null;
      setWaiting(false);
    }
  };

  const newConversation = async () => {
    localStorage.removeItem(sessionKey);
    setMessages([]);
    setError("");
    try {
      const created = await api("/api/v1/chat/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patient_id: patientId }) });
      localStorage.setItem(sessionKey, created.id);
      setConversationId(created.id);
    } catch (reason) { setError(reason.message); }
  };

  const exportChat = () => {
    if (!messages.length) return;
    const text = messages.map((message) => `${message.role === "user" ? "Patient" : "Assistant"}:\n${message.content}`).join("\n\n");
    const file = new Blob([`Medical Assistant conversation\nPatient reference: ${patientId}\nExported: ${new Date().toLocaleString()}\n\n${text}\n`], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `medical-chat-${patientId}-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="mx-auto grid max-w-[1250px] gap-5 xl:grid-cols-[minmax(0,1fr)_270px]">
      <section className="flex min-h-[calc(100vh-183px)] flex-col overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex h-[73px] shrink-0 items-center gap-3 border-b border-slate-100 px-5">
          <Glyph className="h-10 w-10 rounded-xl bg-brand-tint text-lg text-brand-700">✚</Glyph>
          <div><h2 className="text-sm font-bold">Care assistant</h2><p className="mt-1 text-[10px] text-ink-muted">Ask about care, hospital services, or symptoms</p></div>
          <button onClick={exportChat} title="Export entire chat" className="ml-auto h-9 w-9 rounded-lg border border-line text-lg text-ink-muted hover:bg-surface">⇩</button>
        </div>
        <div className="flex min-h-[270px] flex-1 flex-col gap-5 overflow-y-auto p-5" aria-live="polite">
          {!messages.length && <div className="m-auto max-w-sm text-center text-ink-muted"><Glyph className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-brand-tint text-2xl text-brand-700">✚</Glyph><h3 className="text-sm font-bold text-ink">How can I help today?</h3><p className="mt-2 text-xs leading-5">Ask about symptoms, doctors, appointments, reports, prescriptions, and other care questions.</p></div>}
          {messages.map((message, index) => <ChatMessage key={`${index}-${message.role}`} message={message} onCopy={copyMessage} />)}
          {waiting && <div className="flex items-center gap-1 px-3 text-xs text-ink-muted"><span className="animate-pulse">● ● ●</span><span className="ml-2">Preparing a response…</span><span className="ml-auto tabular-nums">{waitSeconds.toFixed(1)}s</span></div>}
          <div ref={bottomRef} />
        </div>
        {error && <p role="alert" className="px-5 pb-2 text-xs text-red-700">{error}</p>}
        <form onSubmit={submit} className="mx-4 flex items-end gap-2 rounded-xl border border-line p-2 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} rows={1} maxLength={5000} placeholder="Type in English, Urdu, or Roman Urdu…" disabled={waiting} className="max-h-28 min-h-9 flex-1 resize-y border-0 bg-transparent px-2 py-2 text-xs outline-none placeholder:text-slate-400" aria-label="Your message" />
          {!waiting ? <button type="submit" disabled={!conversationId || !draft.trim()} aria-label="Send message" className="h-9 w-9 rounded-lg bg-brand-700 text-xl text-white hover:bg-brand-800 disabled:opacity-50">↑</button> : <button type="button" onClick={() => abortRef.current?.abort()} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-xs text-red-700">Stop response</button>}
        </form>
        <div className="flex justify-between px-5 py-2.5 text-[9px] text-slate-400"><span>Medical information support · Not a substitute for emergency care</span><span>Tokens: {usage ?? "—"}</span></div>
      </section>

      <aside className="flex flex-col gap-3">
        <section className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-start gap-3"><Glyph className="h-8 w-8 rounded-lg bg-slate-100 text-lg text-ink-muted">♙</Glyph><div><h3 className="text-xs font-bold">Personal conversation</h3><p className="mt-1 text-[10px] leading-4 text-ink-muted">This chat is saved for this patient.</p></div></div>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-[9px] text-ink-muted"><span>Patient reference</span><code className="text-ink">{patientId}</code></div>
          <button onClick={newConversation} disabled={waiting} className="pt-3 text-[10px] font-bold text-brand-700 hover:text-brand-800 disabled:opacity-50">＋ Start a new conversation</button>
        </section>
        <section className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-start gap-3"><Glyph className="h-8 w-8 rounded-lg bg-brand-tint text-lg text-brand-700">◷</Glyph><div><h3 className="text-xs font-bold">Response details</h3><p className="mt-1 text-[10px] leading-4 text-ink-muted">Timing and model usage for your last message.</p></div></div>
          <Metric label="Response time" value={responseTime == null ? "—" : `${responseTime} ms`} />
          <Metric label="Model route" value={route} />
          <Metric label="Token usage" value={usage == null ? "—" : `${usage} tokens`} />
        </section>
        <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-[10px] leading-4 text-amber-900"><span>ⓘ</span><p>If you may be experiencing a medical emergency, contact your local emergency service now.</p></div>
      </aside>
    </div>
  );
}

function SummaryView() {
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

export default function App() {
  const [view, setView] = useState("chat");
  const embeddedMode = new URLSearchParams(window.location.search).get("embed") === "cityhospital";
  const parentOrigin = new URLSearchParams(window.location.search).get("parentOrigin");
  const [embeddedSession, setEmbeddedSession] = useState(null);

  // Accept a patient session only from the CityHospital page that embedded this app.
  useEffect(() => {
    if (!embeddedMode || !parentOrigin) return undefined;
    const receiveSession = (event) => {
      if (event.source !== window.parent || event.origin !== parentOrigin) return;
      if (event.data?.type !== "cityhospital-session" || !event.data.token || !event.data.patientId) return;
      cityHospitalAuth = {
        token: event.data.token,
        patientId: String(event.data.patientId),
        apiUrl: event.data.apiUrl,
      };
      setEmbeddedSession({
        patientId: String(event.data.patientId),
        patientName: event.data.patientName || "",
      });
    };
    window.addEventListener("message", receiveSession);
    window.parent.postMessage({ type: "medical-assistant-ready" }, parentOrigin);
    return () => {
      window.removeEventListener("message", receiveSession);
      cityHospitalAuth = null;
    };
  }, [embeddedMode, parentOrigin]);

  const [patientId] = useState(() => {
    const existing = localStorage.getItem(PATIENT_KEY);
    if (existing) return existing;
    const created = `patient-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(PATIENT_KEY, created);
    return created;
  });
  const [modelStatus, setModelStatus] = useState({ label: "Checking model…", connected: false });
  const checkModels = useCallback(async () => {
    try {
      const result = await api("/api/v1/health");
      const groq = result.models.primary.connected;
      const ollama = result.models.fallback.connected;
      setModelStatus({ label: groq ? "GroqCloud connected" : ollama ? "Ollama fallback ready" : "Models disconnected", connected: groq || ollama });
    } catch { setModelStatus({ label: "Service disconnected", connected: false }); }
  }, []);

  useEffect(() => {
    checkModels();
    const timer = window.setInterval(checkModels, 30000);
    return () => window.clearInterval(timer);
  }, [checkModels]);

  if (embeddedMode && !embeddedSession) {
    return <div className="grid min-h-screen place-items-center text-sm text-ink-muted">Connecting to CityHospital…</div>;
  }
  const activePatientId = embeddedSession?.patientId || patientId;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="flex shrink-0 flex-row items-center gap-3 border-b border-line bg-white px-4 py-3 lg:min-h-screen lg:w-64 lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r lg:px-4 lg:py-7">
        <a href="#" onClick={(event) => { event.preventDefault(); setView("chat"); }} className="flex items-center gap-2.5 no-underline lg:mb-12 lg:ml-2"><Glyph className="h-9 w-9 rounded-xl bg-brand-700 text-xl text-white">✚</Glyph><span className="font-bold leading-4 text-ink">Medical<small className="block text-[10px] font-semibold text-ink-muted">Assistant</small></span></a>
        <span className="hidden px-3 text-[10px] font-bold tracking-[1.2px] text-slate-400 lg:mb-3 lg:block">WORKSPACE</span>
        <nav className="ml-auto flex gap-1 lg:ml-0 lg:flex-col">
          <NavButton active={view === "chat"} onClick={() => setView("chat")} icon="◉">Patient chatbot</NavButton>
          {!embeddedMode && <NavButton active={view === "summary"} onClick={() => setView("summary")} icon="▤">Clinical summarizer</NavButton>}
        </nav>
        <div className="mt-auto hidden gap-2 rounded-xl border border-line p-3 text-brand-700 lg:flex"><span>⌑</span><div><b className="text-[11px] text-ink">Your care, thoughtfully supported</b><p className="mt-1 text-[10px] leading-4 text-ink-muted">Answers use connected records and cautious AI assistance.</p></div></div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col px-3 sm:px-6 lg:px-9">
        <header className="mb-5 flex h-[88px] shrink-0 items-center justify-between border-b border-line sm:h-[104px]"><div><span className="text-[9px] font-bold tracking-[1.2px] text-slate-400">CITYHOSPITAL · MEDICAL ASSISTANT</span><h1 className="mt-1 text-xl font-bold tracking-tight sm:text-[22px]">{view === "chat" ? "Patient chatbot" : "Clinical summarizer"}</h1></div><div className="flex items-center gap-3"><div className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-[9px] text-ink-muted sm:text-[11px]"><i className={`h-2 w-2 rounded-full ${modelStatus.connected ? "bg-emerald-500" : "bg-amber-500"}`} /><span>{modelStatus.label}</span></div>{embeddedMode && <><span className="hidden text-xs text-ink-muted sm:block">{embeddedSession?.patientName}</span><button onClick={() => window.parent.postMessage({ type: "cityhospital-logout" }, parentOrigin)} className="rounded-lg border border-line bg-white px-3 py-2 text-[10px] font-semibold text-ink hover:bg-surface">Log out</button></>}</div></header>
        <div className="flex-1">{view === "chat" ? <ChatView patientId={activePatientId} /> : <SummaryView />}</div>
        <footer className="mt-3 flex h-10 items-center justify-between text-[8px] text-slate-400 sm:text-[9px]"><span>Medical Assistant Services</span><span>Patient chatbot · Doctor clinical summarizer</span></footer>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, children }) {
  return <button onClick={onClick} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${active ? "bg-brand-tint text-brand-800" : "text-ink-muted hover:bg-surface"}`}><Glyph className="text-base">{icon}</Glyph>{children}</button>;
}
