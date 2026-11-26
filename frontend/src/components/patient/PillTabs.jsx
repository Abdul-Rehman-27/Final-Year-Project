/** Props: `tabs`, `active`, and `onChange` control the selected tab. */
export default function PillTabs({ tabs, active, onChange }) {
  return <div className="flex gap-2" role="tablist">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => onChange(tab.id)} className={`min-h-[44px] rounded-xl px-[18px] text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-brand-600 ${active === tab.id ? "bg-brand-tint text-brand-deep" : "border border-field bg-white text-ink"}`}>{tab.label}</button>)}</div>;
}
