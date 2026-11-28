import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { formatShort } from "../../utils/datetime.js";
import { notificationTarget } from "../../utils/doctorNotifications.js";
import Button from "../common/Button.jsx";

const POLL_MS = 60000;

/** In-app notification bell for the doctor: same look and behaviour as the patient bell; each item opens its appointment. */
export default function DoctorNotificationBell() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ unread_count: 0, items: [] });
  const [failed, setFailed] = useState(false);
  const box = useRef(null);

  const load = useCallback(() => doctorPortalService.listNotifications().then((d) => { setState(d); setFailed(false); }).catch(() => setFailed(true)), []);
  useEffect(() => { load(); const id = setInterval(load, POLL_MS); return () => clearInterval(id); }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  const openItem = (n) => {
    if (!n.read_at) doctorPortalService.readNotification(n.id).then(load).catch(() => {});
    const to = notificationTarget(n);
    if (to) { setOpen(false); navigate(to); }
  };
  const markAll = () => doctorPortalService.readAllNotifications().then(load).catch(() => {});
  const count = state.unread_count;
  const title = t("doctor.notifications.title");

  return <div ref={box} className="relative">
    <button type="button" aria-label={`${title}${count ? ` (${count})` : ""}`} aria-expanded={open} onClick={() => { setOpen((v) => !v); if (!open) load(); }} className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-600">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
      {count > 0 && <span className="absolute -end-1 -top-1 flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-brand-700 px-1 text-[11px] font-bold text-white">{count > 99 ? "99+" : count}</span>}
    </button>
    {open && <div role="dialog" aria-label={title} className="absolute end-0 top-12 z-30 w-[min(360px,calc(100vw-32px))] rounded-[14px] border border-line bg-white p-3 shadow-[0_8px_30px_rgba(15,42,39,0.15)]">
      <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-[16px] font-bold">{title}</h2>{count > 0 && <Button variant="secondary" size="sm" fullWidth={false} onClick={markAll}>{t("doctor.notifications.markAll")}</Button>}</div>
      {failed && <p role="alert" className="py-2 text-sm text-ink-muted">{t("doctor.loadError")}</p>}
      {!failed && state.items.length === 0 && <p className="py-3 text-sm text-ink-muted">{t("doctor.notifications.empty")}</p>}
      <ul className="max-h-[360px] overflow-y-auto">{state.items.map((n) => <li key={n.id}><button type="button" onClick={() => openItem(n)} className={`block w-full border-b border-line px-2 py-3 text-start focus:outline-none focus:ring-2 focus:ring-brand-600 ${n.read_at ? "" : "bg-brand-50"}`}><p className={`text-[14px] ${n.read_at ? "" : "font-bold"}`}>{n.message}</p><p className="mt-0.5 text-[12px] text-ink-muted">{formatShort(n.created_at, lang)}</p></button></li>)}</ul>
    </div>}
  </div>;
}
