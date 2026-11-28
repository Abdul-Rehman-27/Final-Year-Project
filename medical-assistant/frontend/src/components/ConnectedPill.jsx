export default function ConnectedPill({ t, status }) {
  const label = !status.checked ? t("checking") : status.connected ? t("connected") : t("disconnected");
  const tone = status.connected ? "bg-brand-tint text-brand-800" : status.checked ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-ink-muted";
  return <span className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-bold ${tone}`}>{label}</span>;
}
