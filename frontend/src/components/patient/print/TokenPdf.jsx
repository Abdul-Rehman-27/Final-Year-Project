import { QRCodeSVG } from "qrcode.react";
import MicroLabel from "../MicroLabel.jsx";
import PrintFlag from "./PrintFlag.jsx";
import PrintFooter from "./PrintFooter.jsx";
import PrintLetterhead from "./PrintLetterhead.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { TOKEN_SLIP } from "../../../data/mockPatient.js";
import { buildTokenQrValue } from "../../../utils/qr.js";

const replace = (text, values) => Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), text);

/** Props: none; renders the 600 × 820 appointment token document. */
export default function TokenPdf() {
  const { t } = useLanguage();
  const details = [["patient", TOKEN_SLIP.patient], ["bookingNo", TOKEN_SLIP.bookingNo], ["doctor", TOKEN_SLIP.doctor], ["department", TOKEN_SLIP.department], ["dateTime", TOKEN_SLIP.when], ["room", TOKEN_SLIP.room]];
  const qrValue = buildTokenQrValue({ bookingNo: TOKEN_SLIP.bookingNo, token: TOKEN_SLIP.token });
  return <article className="flex h-full w-full flex-col overflow-hidden font-portal text-[14px] leading-normal text-ink"><PrintLetterhead /><div className="mt-[30px] text-center"><MicroLabel className="text-[10px] tracking-[1px] text-[#3F5954]">{t("patient.print.token.tokenNumber")}</MicroLabel><p className="mb-0 mt-1 text-[96px] font-bold leading-[1.1] tracking-[4px] text-brand-700">{TOKEN_SLIP.token}</p><PrintFlag className="mt-1.5 text-[12px]">{t("patient.print.token.confirmed")}</PrintFlag></div><div className="mx-12 mt-7 grid grid-cols-2 gap-[14px] rounded-[10px] bg-[#F1F6F5] p-4">{details.map(([label, value]) => <div key={label}><MicroLabel className="text-[10px] tracking-[1px] text-[#3F5954]">{t(`patient.print.token.details.${label}`)}</MicroLabel><p className="mt-0.5 text-[13.5px] font-bold">{value}</p></div>)}</div><p className="mx-12 mt-[22px] whitespace-nowrap rounded-[10px] border-[1.5px] border-dashed border-brand-700 px-4 py-[14px] font-bold text-brand-deep">{t("patient.print.token.notice")}</p><div className="mt-auto flex justify-center"><QRCodeSVG value={qrValue} size={110} level="M" fgColor="#0F2A27" bgColor="#FFFFFF" marginSize={4} role="img" aria-label={replace(t("patient.print.token.qrAria"), { bookingNo: TOKEN_SLIP.bookingNo })} /></div><PrintFooter className="mt-auto" pageCount={t("patient.print.token.pageCount")}>{t("patient.print.token.computerGenerated")}</PrintFooter></article>;
}
