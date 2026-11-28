import { useLanguage } from "../../context/LanguageContext.jsx";
import { patientErrorKey } from "../../services/patientPortalService.js";
import PortalButton from "./PortalButton.jsx";

/** Shows a loading line or an error with retry; renders children once data is ready. */
export default function LoadState({ loading, error, onRetry, hasData, children }) {
  const { t } = useLanguage();
  if (error) {
    const key = patientErrorKey(error); const msg = t(key);
    return <div role="alert" className="rounded-[14px] bg-surface p-4 text-[15px] text-ink"><p>{msg === key ? t("patient.errors.GENERIC") : msg}</p>{onRetry && <PortalButton className="mt-3" variant="secondary" onClick={onRetry}>{t("patient.retry")}</PortalButton>}</div>;
  }
  if (loading && !hasData) return <p role="status" className="text-[15px] text-ink-soft">{t("patient.loading")}</p>;
  return children;
}
