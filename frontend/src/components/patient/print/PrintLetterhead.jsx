import { useLanguage } from "../../../context/LanguageContext.jsx";
import { HOSPITAL } from "../../../data/mockPatient.js";

/** Props: none; renders the shared hospital print letterhead. */
export default function PrintLetterhead() {
  const { t } = useLanguage();
  return <header className="flex items-center justify-between border-b-4 border-brand-700 px-12 pb-[18px] pt-[34px]"><div className="flex items-center gap-3"><span className="flex h-[42px] w-[42px] items-center justify-center rounded-[11px] bg-brand-700 text-white" aria-hidden="true"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" /></svg></span><span className="text-[22px] font-bold text-brand-700">{t("brand")}</span></div><div className="text-right text-[11px] leading-[1.5] text-[#3F5954]"><p>{HOSPITAL.address}</p><p>{HOSPITAL.contact}</p><p>{HOSPITAL.hours}</p></div></header>;
}
