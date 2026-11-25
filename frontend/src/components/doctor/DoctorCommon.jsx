import { useEffect, useState } from "react";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { fill } from "../../utils/format.js";
import Alert from "../common/Alert.jsx";
import Button from "../common/Button.jsx";
import Badge from "../common/Badge.jsx";

export function errorText(t, err) {
  if (!err) return t("auth.errors.generic");
  if (err.code === "NETWORK") return t("auth.errors.network");
  const key = `doctor.errors.${err.code || err.message}`;
  return t(key) === key ? t("auth.errors.generic") : t(key);
}
export function ErrorState({ error, onRetry }) {
  const { t } = useLanguage();
  return <div className="space-y-3"><Alert>{errorText(t, error)}</Alert><Button fullWidth={false} onClick={onRetry}>{t("doctor.tryAgain")}</Button></div>;
}
export function LoadState({ loading, error, onRetry, children }) {
  const { t } = useLanguage();
  if (loading) return <p className="py-8 text-ink-muted">{t("common.loading")}</p>;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  return children;
}
export function useRequest(loader, deps = []) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(null), [nonce, setNonce] = useState(0);
  const retry = () => setNonce((x) => x + 1);
  useEffect(() => { let active = true; setLoading(true); setError(null); loader().then((x) => active && setData(x)).catch((e) => active && setError(e)).finally(() => active && setLoading(false)); return () => { active = false; }; }, [nonce, ...deps]);
  return { data, setData, loading, error, retry };
}
const statuses = {
  active: ["doctor.status.visit.active", "success"], ready: ["doctor.status.lab.ready", "success"],
  confirmed: ["doctor.status.appt.confirmed", "success"], waiting: ["doctor.status.visit.waiting", "success"],
  in_progress: ["doctor.status.visit.in_progress", "success"], scheduled: ["doctor.status.lab.scheduled", "warning"],
  requested: ["doctor.status.lab.requested", "warning"], holding: ["doctor.status.visit.holding", "warning"],
  pending: ["doctor.status.appt.pending", "warning"], not_arrived: ["doctor.status.visit.not_arrived", "warning"],
  later: ["doctor.status.visit.later", "neutral"], completed: ["doctor.status.visit.completed", "neutral"],
  cancelled: ["doctor.status.visit.cancelled", "danger"], incomplete: ["doctor.status.visit.incomplete", "danger"],
  grace_expired: ["doctor.status.visit.expired", "danger"],
};
export function Status({ value }) {
  const { t } = useLanguage();
  const [key, tone] = statuses[value] || [null, "neutral"];
  return <Badge tone={tone}>{key ? t(key) : (value || "—")}</Badge>;
}
export function SectionLabel({ children }) { return <p className="text-xs font-bold uppercase tracking-[.08em] text-brand-700">{children}</p>; }
export function fillT(t, key, values) { return fill(t(key), values); }
export function NotFoundState({ backTo }) {
  const { t } = useLanguage();
  return <div className="space-y-4"><Alert>{t("doctor.notFound")}</Alert><a href={backTo || "/doctor"} className="font-bold text-brand-700">← {t("doctor.back")}</a></div>;
}
