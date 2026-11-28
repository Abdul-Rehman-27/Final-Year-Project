import { useCallback, useEffect, useRef, useState } from "react";
import StructuredReply from "../StructuredReply";
import { api } from "../lib/api";
import { detectLanguage } from "../lib/language";
import Glyph from "./Glyph";

// The original chat page, moved out of App.jsx unchanged. Used only outside the CityHospital iframe.
const SESSION_KEY = "medical-assistant-session-id";

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

export default function StandaloneChat({ patientId }) {
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
