import { QRCodeSVG } from "qrcode.react";
import PrintLetterhead from "./PrintLetterhead.jsx";
import PrintFooter from "./PrintFooter.jsx";
import PrintInfoPanel from "./PrintInfoPanel.jsx";
import PrintSection from "./PrintSection.jsx";
import PrintSignature from "./PrintSignature.jsx";
import PrintTitle from "./PrintTitle.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { buildPrescriptionQrValue } from "../../../utils/qr.js";

const replace = (text, values) => Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), text);

/** Props: `prescription` supplies the printable prescription document data. */
export default function PrescriptionPdf({ prescription }) {
  const { t } = useLanguage();
  const details = [["rxNumber", prescription.id], ["dateIssued", prescription.givenOn], ["duration", prescription.duration], ["patient", prescription.patientName], ["ageSex", `${prescription.age} · ${prescription.sex}`], ["doctor", `${prescription.doctor} · ${prescription.department}`]].map(([label, value]) => ({ label: t(`patient.print.prescription.details.${label}`), value }));
  const qrValue = buildPrescriptionQrValue({ rxNo: prescription.id });
  return <article className="flex h-full w-full flex-col overflow-hidden font-portal text-ink"><PrintLetterhead hospital={prescription.hospital} /><PrintTitle size="28px" className="mt-7">{t("patient.print.prescription.title")}</PrintTitle><main className="flex flex-1 flex-col px-12"><PrintInfoPanel items={details} className="mt-6" /><PrintSection title={t("patient.print.prescription.medicines")} className="mt-7"><table className="mt-2 w-full border-collapse text-left text-[13px]"><thead><tr className="border-b-2 border-brand-700">{["number", "medicine", "dosage", "timing"].map((key) => <th key={key} scope="col" className="px-2 py-2 text-[10px] font-bold uppercase tracking-[1px] text-brand-700">{t(`patient.print.prescription.table.${key}`)}</th>)}</tr></thead><tbody>{prescription.medicines.map((medicine, index) => <tr key={medicine.name} className="border-b border-divider"><td className="px-2 py-4">{index + 1}</td><td className="px-2 py-4 font-bold">{medicine.name}</td><td className="px-2 py-4">{medicine.dosage}</td><td className="px-2 py-4">{medicine.timing}</td></tr>)}</tbody></table></PrintSection><PrintSection title={t("patient.print.prescription.instructions")} className="mt-7"><p className="mt-2 text-[13px] leading-[1.6]">{prescription.note}</p></PrintSection><div className="mt-auto flex items-end justify-between pb-6"><QRCodeSVG value={qrValue} size={84} level="M" fgColor="#0F2A27" bgColor="#FFFFFF" marginSize={4} role="img" aria-label={replace(t("patient.print.prescription.qrAria"), { rxNo: prescription.id })} /><PrintSignature width="220px" caption={t("patient.print.prescription.signature")} name={prescription.doctor} /></div></main><PrintFooter pageCount={t("patient.print.prescription.pageCount")}>{t("patient.print.prescription.footer")}</PrintFooter></article>;
}
