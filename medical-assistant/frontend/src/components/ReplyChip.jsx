// Faded "replying to" chip above the message box. The ✕ removes the reply link.
export default function ReplyChip({ t, text, onClear }) {
  return (
    <div className="mx-6 mb-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink-soft opacity-90">
      <span aria-hidden="true">↩</span>
      <span className="shrink-0 font-bold">{t("replyingTo")}</span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <button type="button" onClick={onClear} aria-label={t("removeReply")} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600">✕</button>
    </div>
  );
}
