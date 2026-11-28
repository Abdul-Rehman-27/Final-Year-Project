import { parseDate } from "../hooks/useChat";

function isToday(date) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function Group({ label, items, activeId, onSelect, t }) {
  if (!items.length) return null;
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.8px] text-ink-soft">{label}</h3>
      <ul className="space-y-1">
        {items.map((item) => {
          const active = String(item.id) === String(activeId);
          return (
            <li key={item.id}>
              <button type="button" onClick={() => onSelect(item.id)} aria-current={active ? "true" : undefined}
                className={`block w-full rounded-xl px-3 py-2.5 text-start text-[15px] leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600 ${active ? "bg-brand-tint font-bold text-brand-800" : "text-ink-soft hover:bg-surface"}`}>
                {item.title && item.title !== "New conversation" ? item.title : t("untitled")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// History card: "New chat" button, then conversations grouped into Today / Earlier (newest first).
export default function HistoryList({ t, conversations, activeId, onSelect, onNew, disabled }) {
  const sorted = [...conversations].sort((a, b) => (parseDate(b.updated_at)?.getTime() || 0) - (parseDate(a.updated_at)?.getTime() || 0));
  const today = sorted.filter((item) => isToday(parseDate(item.updated_at)));
  const earlier = sorted.filter((item) => !isToday(parseDate(item.updated_at)));
  return (
    <aside aria-label={t("historyLabel")} className="flex max-h-44 min-h-0 flex-col overflow-hidden rounded-[20px] border border-line bg-white p-5 lg:max-h-full lg:self-start">
      <button type="button" onClick={onNew} disabled={disabled} className="mb-5 h-[52px] w-full shrink-0 rounded-xl bg-brand-700 text-[16px] font-bold text-white transition-colors hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:opacity-50">{t("newChat")}</button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!sorted.length && <p className="px-1 text-sm text-ink-soft">{t("noChats")}</p>}
        <Group label={t("today")} items={today} activeId={activeId} onSelect={onSelect} t={t} />
        <Group label={t("earlier")} items={earlier} activeId={activeId} onSelect={onSelect} t={t} />
      </div>
    </aside>
  );
}
