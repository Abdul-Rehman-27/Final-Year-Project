/** Props: `caption`, `name`, `role`, `align`, and `width` configure a print signature block. */
export default function PrintSignature({ caption, name, role, align = "center", width = "200px" }) {
  const alignClass = { start: "text-start", center: "text-center", end: "text-end" }[align] || "text-center";
  return <div style={{ width }} className={alignClass}><div className="border-t border-ink" /><p className="mt-2 text-[11px] text-[#3F5954]">{caption}</p><p className="mt-1 text-[13px] font-bold">{name}{role && <span className="font-normal"> · {role}</span>}</p></div>;
}
