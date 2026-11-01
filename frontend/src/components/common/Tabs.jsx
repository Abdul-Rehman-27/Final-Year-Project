/** Simple tab bar. tabs = [{ id, label }]. The page decides what to show for the active id. */
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" className="mb-6 flex gap-2 overflow-x-auto border-b border-line">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-base font-bold transition-colors ${
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
