import PrintShell from "../../../components/patient/print/PrintShell.jsx";
import TokenPdf from "../../../components/patient/print/TokenPdf.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { TOKEN_SLIP } from "../../../data/mockPatient.js";

export default function TokenPage() {
  const { t } = useLanguage();
  return <PrintShell title={t("patient.print.token.documentTitle").replace("{token}", TOKEN_SLIP.token)} size="600px 820px"><TokenPdf /></PrintShell>;
}
