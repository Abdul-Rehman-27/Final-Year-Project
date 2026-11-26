import { useLanguage } from "../../context/LanguageContext.jsx";

/** Props: none; renders the patient portal hospital mark. */
export default function PatientLogo() {
  const { t } = useLanguage();
  return <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-700 text-white" aria-hidden="true"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" /></svg></span><span className="text-[19px] font-bold text-brand-700">{t("brand")}</span></div>;
}
