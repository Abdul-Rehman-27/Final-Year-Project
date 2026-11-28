import { useSearchParams } from "react-router-dom";
import LoadState from "../../../components/patient/LoadState.jsx";
import PrescriptionPdf from "../../../components/patient/print/PrescriptionPdf.jsx";
import PrintShell from "../../../components/patient/print/PrintShell.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { useAsync } from "../../../hooks/useAsync.js";
import { patientPortalService } from "../../../services/patientPortalService.js";
import { prescriptionView } from "../../../utils/patientAdapters.js";

/** Reads ?id=<prescription id>; renders its printable A4 document from live data. */
export default function PrescriptionPage() {
  const { t, lang } = useLanguage();
  const [params] = useSearchParams();
  const id = params.get("id");
  const { data, error, loading, reload } = useAsync(() => patientPortalService.getPrescription(id), [id]);
  const rx = data ? prescriptionView(data, lang) : null;
  return <LoadState loading={loading} error={error} onRetry={reload} hasData={!!rx}>{rx && <PrintShell title={t("patient.print.prescription.documentTitle").replace("{id}", rx.id)} size="A4"><PrescriptionPdf prescription={rx} /></PrintShell>}</LoadState>;
}
