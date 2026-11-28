import MicroLabel from "./MicroLabel.jsx";

/** Props: `type` selects an input, native date input, or select control. */
export default function PortalField({ id, label, type = "text", children, className = "", ...props }) {
  const controlClass = "h-[46px] w-full rounded-xl border border-field bg-white px-3.5 text-[15px] text-ink-soft outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20";
  return <div className={`mb-[14px] ${className}`}><MicroLabel as="label" htmlFor={id}>{label}</MicroLabel><div className="relative mt-1.5">{type === "select" ? <select id={id} className={`${controlClass} appearance-none pr-10`} {...props}>{children}</select> : <input id={id} type={type} className={controlClass} {...props} />}{type === "select" && <svg viewBox="0 0 24 24" className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>}</div></div>;
}
