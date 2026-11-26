import PortalBadge from "../PortalBadge.jsx";
import PrintFooter from "./PrintFooter.jsx";
import PrintInfoPanel from "./PrintInfoPanel.jsx";
import PrintLetterhead from "./PrintLetterhead.jsx";
import PrintSection from "./PrintSection.jsx";
import PrintSignature from "./PrintSignature.jsx";
import PrintTitle from "./PrintTitle.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { PATIENT } from "../../../data/mockPatient.js";

const flagTones = { Normal: "success", Low: "warning", High: "warning", Critical: "danger" };
const flagKeys = { Normal: "normal", Low: "low", High: "high", Critical: "critical" };

/** Props: `report` supplies the printable laboratory report data. */
export default function LabReportPdf({ report }) {
  const { t } = useLanguage();
  const details = [["patient", PATIENT.name], ["ageSex", `${report.age} · ${report.sex}`], ["reportNo", report.reportNo], ["test", report.name], ["collected", report.collected], ["referredBy", report.referredBy]].map(([label, value]) => ({ label: t(`patient.print.lab.details.${label}`), value }));
  return <article className="flex h-full w-full flex-col overflow-hidden font-portal text-ink"><PrintLetterhead /><PrintTitle className="mt-7">{t("patient.print.lab.title")}</PrintTitle><main className="flex flex-1 flex-col px-12"><PrintInfoPanel items={details} className="mt-6" /><PrintSection title={t("patient.print.lab.results")} className="mt-7"><table className="mt-2 w-full border-collapse text-left text-[15px]"><thead><tr className="border-b-2 border-brand-700">{["test", "result", "reference", "flag"].map((key) => <th key={key} scope="col" className="px-2 py-2 text-[11px] font-bold uppercase tracking-[1px] text-[#3F5954]">{t(`patient.print.lab.table.${key}`)}</th>)}</tr></thead><tbody>{report.results.map((result) => <tr key={result.test} className="border-b border-divider"><td className="w-1/4 px-2 py-4 font-bold">{result.test}</td><td className="w-[23%] px-2 py-4">{result.result}</td><td className="w-[32%] px-2 py-4">{result.reference}</td><td className="w-1/5 px-2 py-4"><PortalBadge tone={flagTones[result.flag]}>{t(`patient.print.lab.flags.${flagKeys[result.flag]}`)}</PortalBadge></td></tr>)}</tbody></table></PrintSection><PrintSection title={t("patient.print.lab.comments")} className="mt-7"><p className="mt-2 text-[13px] leading-[1.6]">{report.comments}</p></PrintSection><div className="mt-auto flex items-end justify-between pb-6"><PrintSignature caption={t("patient.print.lab.pathologistSignature")} name={report.pathologist || t("patient.print.lab.pathologistPlaceholder")} align="start" /><PrintSignature caption={t("patient.print.lab.reviewedByDoctor")} name={report.reviewedBy} align="end" /></div></main><PrintFooter pageCount={t("patient.print.common.pageCount")}>{t("patient.print.lab.footer")}</PrintFooter></article>;
}
