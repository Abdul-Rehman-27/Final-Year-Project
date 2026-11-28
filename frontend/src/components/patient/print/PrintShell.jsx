import { useEffect, useRef } from "react";
import PortalButton from "../PortalButton.jsx";
import { useLanguage } from "../../../context/LanguageContext.jsx";

/** Props: `title`, `size`, and `children` configure a printable single-page document. */
export default function PrintShell({ title, size, children }) {
  const { t } = useLanguage();
  const hasAutoPrinted = useRef(false);
  // CHANGED: page box is 1px / 0.5mm SHORTER than the paper so it can never overflow onto a 2nd (blank) page.
  const pageStyle = size === "A4" ? { width: "210mm", height: "296.5mm" } : { width: size.split(" ")[0], height: `calc(${size.split(" ")[1]} - 1px)` };
  // CHANGED: wait for fonts + two paints before opening the print dialog (also used by the button).
  const printWhenReady = () => {
    const go = () => requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    if (document.fonts?.ready) document.fonts.ready.then(go, go); else go();
  };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const printStyle = document.createElement("style");
    printStyle.textContent = `@page { size: ${size}; margin: 0; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; }
        .print-shell { min-height: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
        .print-page { margin: 0 !important; box-shadow: none !important; }
        .print-page, .print-page * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .print-page { break-inside: avoid; page-break-after: avoid; overflow: hidden !important; }
      }`;
    document.head.appendChild(printStyle);
    return () => { document.title = previousTitle; printStyle.remove(); };
  }, [size, title]);

  useEffect(() => {
    const autoPrint = new URLSearchParams(window.location.search).get("autoprint") === "1";
    if (!autoPrint || hasAutoPrinted.current) return;
    hasAutoPrinted.current = true;
    printWhenReady();
  }, []);

  return <div className="print-shell min-h-screen overflow-x-auto bg-divider p-6"><PortalButton className="fixed right-6 top-6 z-10 print:hidden" onClick={printWhenReady}>{t("patient.print.token.printSave")}</PortalButton><div className="print-page mx-auto flex bg-white shadow-[0_4px_24px_rgba(15,42,39,0.12)]" style={pageStyle}>{children}</div></div>;
}
