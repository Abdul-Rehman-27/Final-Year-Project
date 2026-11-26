import { useSearchParams } from "react-router-dom";
import RadiologyReportPdf from "../../../components/patient/print/RadiologyReportPdf.jsx";
import PrintShell from "../../../components/patient/print/PrintShell.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { LAB_REPORTS } from "../../../data/mockPatient.js";

/** Props: none; selects a radiology report and renders its printable A4 document. */
export default function RadiologyReportPage() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const report = LAB_REPORTS.find((item) => item.id === searchParams.get("id") && item.pdf === "radiology-report") || LAB_REPORTS.find((item) => item.id === "chest-xray");
  return <PrintShell title={t("patient.print.radiology.documentTitle").replace("{reportNo}", report.reportNo)} size="A4"><RadiologyReportPdf report={report} /></PrintShell>;
}
