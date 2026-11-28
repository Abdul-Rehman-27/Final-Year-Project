import PatientPageHeader from "../../components/patient/PatientPageHeader.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

export default function PatientStubPage({ titleKey }) {
  const { t } = useLanguage();
  return <PatientPageHeader title={t(titleKey)} subtitle={t("patient.comingNext")} />;
}
