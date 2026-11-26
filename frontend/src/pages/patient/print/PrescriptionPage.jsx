import { useSearchParams } from "react-router-dom";
import PrescriptionPdf from "../../../components/patient/print/PrescriptionPdf.jsx";
import PrintShell from "../../../components/patient/print/PrintShell.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { PRESCRIPTIONS } from "../../../data/mockPatient.js";

/** Props: none; selects a mock prescription and renders its printable A4 document. */
export default function PrescriptionPage() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const prescription = PRESCRIPTIONS.find((item) => item.id === searchParams.get("id")) || PRESCRIPTIONS[0];
  return <PrintShell title={t("patient.print.prescription.documentTitle").replace("{id}", prescription.id)} size="A4"><PrescriptionPdf prescription={prescription} /></PrintShell>;
}
