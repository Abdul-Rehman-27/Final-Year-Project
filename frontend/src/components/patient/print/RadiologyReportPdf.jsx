import { QRCodeSVG } from "qrcode.react";
import ReportImage from "../ReportImage.jsx";
import PrintFooter from "./PrintFooter.jsx";
import PrintInfoPanel from "./PrintInfoPanel.jsx";
import PrintLetterhead from "./PrintLetterhead.jsx";
import PrintSection from "./PrintSection.jsx";
import PrintSignature from "./PrintSignature.jsx";
import PrintTitle from "./PrintTitle.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { buildReportQrValue } from "../../../utils/qr.js";

const replace = (text, values) => Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), text);

/** Props: `report` supplies the printable radiology report data. */
export default function RadiologyReportPdf({ report }) {
  const { t } = useLanguage();
  const details = [["patient", report.patientName], ["ageSex", `${report.age} · ${report.sex}`], ["reportNo", report.reportNo], ["study", report.study], ["performed", report.performed], ["referredBy", report.referredBy]].map(([label, value]) => ({ label: t(`patient.print.radiology.details.${label}`), value }));
  const qrValue = buildReportQrValue({ reportNo: report.reportNo });
  return <article className="flex h-full w-full flex-col overflow-hidden font-portal text-ink"><PrintLetterhead hospital={report.hospital} /><PrintTitle className="mt-7">{t("patient.print.radiology.title")}</PrintTitle><main className="flex flex-1 flex-col px-12"><PrintInfoPanel items={details} className="mt-6" />{report.images?.length > 0 && <PrintSection title={t("patient.print.radiology.images")} className="mt-7"><div className="mt-2 grid grid-cols-2 gap-4">{report.images.map((image, index) => <figure key={image.id ?? index}><div className="overflow-hidden rounded-[14px] border border-ink"><ReportImage src={image.src} alt={image.caption || t("patient.print.radiology.imageLabels.pa")} label={image.caption || t("patient.print.radiology.imageLabels.pa")} height={250} /></div><figcaption className="mt-1.5 text-[11px] text-[#3F5954]">{image.caption}</figcaption></figure>)}</div></PrintSection>}<PrintSection title={t("patient.print.radiology.technique")} className="mt-6"><p className="mt-1.5 text-[13px] leading-[1.6]">{report.technique}</p></PrintSection><PrintSection title={t("patient.print.radiology.findings")} className="mt-5"><p className="mt-1.5 text-[14.5px] leading-[1.6]">{report.findings}</p></PrintSection><PrintSection title={t("patient.print.radiology.impression")} className="mt-5"><p className="mt-1.5 rounded-[10px] bg-brand-tint px-3.5 py-3 text-[14.5px] font-bold text-brand-deep">{report.impression}</p></PrintSection><div className="mt-auto flex items-end justify-between pb-6"><QRCodeSVG value={qrValue} size={84} level="M" fgColor="#0F2A27" bgColor="#FFFFFF" marginSize={4} role="img" aria-label={replace(t("patient.print.radiology.qrAria"), { reportNo: report.reportNo })} /><PrintSignature caption={t("patient.print.radiology.signature")} name={report.radiologist.name} role={report.radiologist.role} /></div></main><PrintFooter pageCount={t("patient.print.common.pageCount")}>{t("patient.print.radiology.footer")}</PrintFooter></article>;
}
