import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { patientPortalService } from "../../services/patientPortalService.js";
import { formatShort } from "../../utils/datetime.js";
import PortalButton from "./PortalButton.jsx";

const POLL_MS = 60000;

/** In-app notification bell with unread count and a dropdown list (patient). */
export default function NotificationBell() {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ unread_count: 0, items: [] });
  const [failed, setFailed] = useState(false);
  const box = useRef(null);

  const load = useCallback(() => patientPortalService.listNotifications().then((d) => { setState(d); setFailed(false); }).catch(() => setFailed(true)), []);
  useEffect(() => { load(); const id = setInterval(load, POLL_MS); return () => clearInterval(id); }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  const markRead = (n) => { if (n.read_at) return; patientPortalService.readNotification(n.id).then(load).catch(() => {}); };
  const markAll = () => patientPortalService.readAllNotifications().then(load).catch(() => {});
  const count = state.unread_count;

  return <div ref={box} className="relative">
    <button type="button" aria-label={`${t("patient.notifications.title")}${count ? ` (${count})` : ""}`} aria-expanded={open} onClick={() => { setOpen((v) => !v); if (!open) load(); }} className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-600">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
      {count > 0 && <span className="absolute -end-1 -top-1 flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-brand-700 px-1 text-[11px] font-bold text-white">{count > 99 ? "99+" : count}</span>}
    </button>
    {open && <div role="dialog" aria-label={t("patient.notifications.title")} className="absolute end-0 top-12 z-30 w-[min(360px,calc(100vw-32px))] rounded-[14px] border border-line bg-white p-3 shadow-[0_8px_30px_rgba(15,42,39,0.15)]">
      <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-[16px] font-bold">{t("patient.notifications.title")}</h2>{count > 0 && <PortalButton variant="secondary" className="!min-h-[36px] !px-3 !text-[13px]" onClick={markAll}>{t("patient.notifications.markAll")}</PortalButton>}</div>
      {failed && <p role="alert" className="py-2 text-sm text-ink-soft">{t("patient.errors.GENERIC")}</p>}
      {!failed && state.items.length === 0 && <p className="py-3 text-sm text-ink-soft">{t("patient.notifications.empty")}</p>}
      <ul className="max-h-[360px] overflow-y-auto">{state.items.map((n) => <li key={n.id}><button type="button" onClick={() => markRead(n)} className={`block w-full border-b border-divider px-2 py-3 text-start focus:outline-none focus:ring-2 focus:ring-brand-600 ${n.read_at ? "" : "bg-brand-50"}`}><p className={`text-[14px] ${n.read_at ? "" : "font-bold"}`}>{n.message}</p><p className="mt-0.5 text-[12px] text-ink-soft">{formatShort(n.created_at, lang)}</p></button></li>)}</ul>
    </div>}
  </div>;
}
