import { useSearchParams } from "react-router-dom";
import LoadState from "../../../components/patient/LoadState.jsx";
import PrintShell from "../../../components/patient/print/PrintShell.jsx";
import RadiologyReportPdf from "../../../components/patient/print/RadiologyReportPdf.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { useAsync } from "../../../hooks/useAsync.js";
import { useReportImages } from "../../../hooks/useReportImages.js";
import { patientPortalService } from "../../../services/patientPortalService.js";
import { labDetailView } from "../../../utils/patientAdapters.js";

/** Reads ?id=<lab report id>; renders the printable radiology report (with images) from live data. */
export default function RadiologyReportPage() {
  const { t, lang } = useLanguage();
  const [params] = useSearchParams();
  const id = params.get("id");
  const { data, error, loading, reload } = useAsync(() => patientPortalService.getLabReport(id), [id]);
  const view = data ? labDetailView(data, lang) : null;
  const images = useReportImages(id, view?.files);
  const report = view ? { ...view, images } : null;
  return <LoadState loading={loading} error={error} onRetry={reload} hasData={!!report}>{report && <PrintShell title={t("patient.print.radiology.documentTitle").replace("{reportNo}", report.reportNo)} size="A4"><RadiologyReportPdf report={report} /></PrintShell>}</LoadState>;
}
