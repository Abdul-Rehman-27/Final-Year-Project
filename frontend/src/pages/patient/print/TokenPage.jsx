import { useSearchParams } from "react-router-dom";
import LoadState from "../../../components/patient/LoadState.jsx";
import PrintShell from "../../../components/patient/print/PrintShell.jsx";
import TokenPdf from "../../../components/patient/print/TokenPdf.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { useAsync } from "../../../hooks/useAsync.js";
import { patientPortalService } from "../../../services/patientPortalService.js";
import { tokenSlipView } from "../../../utils/patientAdapters.js";

/** Reads ?id=<appointment id>; renders the live token slip. */
export default function TokenPage() {
  const { t, lang } = useLanguage();
  const [params] = useSearchParams();
  const id = params.get("id");
  const { data, error, loading, reload } = useAsync(() => patientPortalService.getToken(id), [id]);
  const slip = data ? tokenSlipView(data, lang) : null;
  return <LoadState loading={loading} error={error} onRetry={reload} hasData={!!slip}>{slip && <PrintShell title={t("patient.print.token.documentTitle").replace("{token}", slip.token)} size="600px 820px"><TokenPdf slip={slip} /></PrintShell>}</LoadState>;
}
