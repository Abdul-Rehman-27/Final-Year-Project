import { useSearchParams } from "react-router-dom";
import LoadState from "../../../components/patient/LoadState.jsx";
import LabReportPdf from "../../../components/patient/print/LabReportPdf.jsx";
import PrintShell from "../../../components/patient/print/PrintShell.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { useAsync } from "../../../hooks/useAsync.js";
import { patientPortalService } from "../../../services/patientPortalService.js";
import { labDetailView } from "../../../utils/patientAdapters.js";

/** Reads ?id=<lab report id>; renders the printable laboratory report from live data. */
export default function LabReportPage() {
  const { t, lang } = useLanguage();
  const [params] = useSearchParams();
  const id = params.get("id");
  const { data, error, loading, reload } = useAsync(() => patientPortalService.getLabReport(id), [id]);
  const report = data ? labDetailView(data, lang) : null;
  return <LoadState loading={loading} error={error} onRetry={reload} hasData={!!report}>{report && <PrintShell title={t("patient.print.lab.documentTitle").replace("{reportNo}", report.reportNo)} size="A4"><LabReportPdf report={report} /></PrintShell>}</LoadState>;
}
