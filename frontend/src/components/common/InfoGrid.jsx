export default function InfoGrid({ items = [], cols = 3, className = "" }) {
  return <div className={`grid gap-[18px] rounded-2xl bg-surface p-[18px] ${cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"} ${className}`}>
    {items.map(({ label, value, dir }, i) => <div key={`${label}-${i}`} className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.08em] text-ink-muted">{label}</p><p dir={dir} className="mt-1 break-words text-[17px] font-bold">{value ?? "—"}</p></div>)}
  </div>;
}
