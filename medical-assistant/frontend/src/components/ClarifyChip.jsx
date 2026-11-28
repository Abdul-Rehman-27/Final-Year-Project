// The assistant's one follow-up question, drawn as a dashed chip. Tapping it starts a reply to that question.
export default function ClarifyChip({ t, question, active, onPick }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-[15px] text-ink">{t("oneMoreQuestion")}</p>
      <button type="button" onClick={onPick} disabled={!onPick} aria-pressed={active}
        className={`rounded-xl border border-dashed border-brand-700 px-4 py-2.5 text-start text-[15px] font-bold text-brand-800 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600 ${active ? "bg-brand-tint" : "bg-brand-50 hover:bg-brand-tint"} disabled:cursor-default`}>
        {question}
      </button>
    </div>
  );
}
