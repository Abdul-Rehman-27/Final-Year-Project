/** Props: title, subtitle, badge, selected, and onSelect describe a selectable summary row. */
export default function PortalSelectRow({ title, subtitle, badge, selected, onSelect }) {
  return <button type="button" aria-pressed={selected} onClick={onSelect} className={`flex w-full items-center justify-between gap-3 rounded-[14px] p-3.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600 ${selected ? "bg-brand-tint" : "bg-transparent hover:bg-brand-50"}`}><span><span className="block text-[15px] font-bold text-ink">{title}</span><span className="block text-sm text-ink-soft">{subtitle}</span></span>{badge}</button>;
}
