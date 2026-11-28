import { useEffect, useRef, useState } from "react";
import { fetchHospitalContact } from "../lib/api";
import useChat from "../hooks/useChat";
import ConnectedPill from "./ConnectedPill";
import EmbeddedMessage from "./EmbeddedMessage";
import HistoryList from "./HistoryList";
import ReplyChip from "./ReplyChip";

// What the CityHospital portal shows inside the iframe: only the history card and the chat card.
// The page title, subtitle and the EN | اردو toggle belong to the portal, so none of them are drawn here.
export default function EmbeddedChat({ patientId, t, modelStatus }) {
  const chat = useChat({ patientId, stoppedText: t("stopped") });
  const { messages, waiting, draft, setDraft, replyTo, setReplyTo, send, stop, error } = chat;
  const [contact, setContact] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { fetchHospitalContact().then(setContact); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, waiting]);

  const submit = (event) => {
    event.preventDefault();
    send(draft);
  };
  const lastIndex = messages.length - 1;

  return (
    <div dir="ltr" className={`grid h-screen grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-4 bg-surface font-portal text-ink lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1`}>
      <HistoryList t={t} conversations={chat.conversations} activeId={chat.conversationId} onSelect={chat.openConversation} onNew={chat.newChat} disabled={waiting} />

      <section aria-label={t("chatLabel")} className="flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-line bg-white">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-divider px-6 py-4">
          <ConnectedPill t={t} status={modelStatus} />
          <span className="text-[14px] text-ink-soft">{t("disclaimer")}</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-6" aria-live="polite">
          {!messages.length && !waiting && (
            <div className="m-auto max-w-sm text-center text-ink-soft">
              <h3 className="text-[18px] font-bold text-ink">{t("emptyTitle")}</h3>
              <p className="mt-2 text-[15px] leading-6">{t("emptyBody")}</p>
            </div>
          )}
          {messages.map((message, index) => (
            <EmbeddedMessage key={`${index}-${message.role}`} t={t} message={message} contact={contact} onBook={send} busy={waiting}
              canReply={index === lastIndex && message.role === "assistant" && !waiting}
              replyActive={Boolean(replyTo) && index === lastIndex}
              onReplyPick={(text) => { setReplyTo({ text }); inputRef.current?.focus(); }} />
          ))}
          {waiting && <p className="self-start text-[14px] text-ink-soft"><span className="animate-pulse">● ● ●</span> <span className="ms-2">{t("thinking")}</span></p>}
          <div ref={bottomRef} />
        </div>

        {error && <p role="alert" className="px-6 pb-2 text-[14px] text-red-700">{error}</p>}
        {replyTo && <ReplyChip t={t} text={replyTo.text} onClear={() => setReplyTo(null)} />}
        <form onSubmit={submit} className="flex shrink-0 items-end gap-3 border-t border-divider px-6 py-4">
          <textarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }}
            rows={1} maxLength={5000} placeholder={t("placeholder")} disabled={waiting} aria-label={t("placeholder")}
            className="max-h-32 min-h-[52px] flex-1 resize-none rounded-xl border border-field bg-white px-4 py-3.5 text-[16px] outline-none placeholder:text-ink-soft/70 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-surface" />
          {!waiting
            ? <button type="submit" disabled={!draft.trim()} className="h-[52px] shrink-0 rounded-xl bg-brand-700 px-7 text-[16px] font-bold text-white hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:opacity-50">{t("send")}</button>
            : <button type="button" onClick={stop} className="h-[52px] shrink-0 rounded-xl border border-red-200 bg-red-50 px-6 text-[16px] font-bold text-red-700">{t("stop")}</button>}
        </form>
      </section>
    </div>
  );
}
