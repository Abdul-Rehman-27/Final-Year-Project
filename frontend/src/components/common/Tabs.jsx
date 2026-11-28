/** Simple tab bar. tabs = [{ id, label }]. The page decides what to show for the active id. */
export default function Tabs({ tabs, active, onChange, variant = "underline" }) {
  return (
    <div role="tablist" className={`mb-6 flex gap-2 overflow-x-auto ${variant === "pill" ? "" : "border-b border-line"}`}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={variant === "pill" ? `whitespace-nowrap rounded-xl border px-[18px] py-2.5 text-[15px] font-bold ${selected ? "border-brand-tint bg-brand-tint text-brand-700" : "border-line bg-white text-ink-muted hover:bg-brand-50"}` : `-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-base font-bold transition-colors ${
              selected ? "border-brand-700 text-brand-700" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
