import { useSearchParams } from "react-router-dom";
import LabReportPdf from "../../../components/patient/print/LabReportPdf.jsx";
import PrintShell from "../../../components/patient/print/PrintShell.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { LAB_REPORTS } from "../../../data/mockPatient.js";

/** Props: none; selects a laboratory report and renders its printable A4 document. */
export default function LabReportPage() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const report = LAB_REPORTS.find((item) => item.id === searchParams.get("id") && item.pdf === "lab-report") || LAB_REPORTS.find((item) => item.id === "cbc");
  return <PrintShell title={t("patient.print.lab.documentTitle").replace("{reportNo}", report.reportNo)} size="A4"><LabReportPdf report={report} /></PrintShell>;
}
