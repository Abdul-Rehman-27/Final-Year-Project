/** Props: `variant="slot"` and `selected` render an accessible appointment time toggle. */
export default function Chip({ variant = "suggest", selected = false, className = "", children, ...props }) {
  const slotClasses = selected ? "border-brand-700 bg-brand-700 px-3.5 text-[15px] text-white" : "border-brand-700 bg-brand-50 px-3.5 text-[15px] text-brand-deep";
  return <button type="button" {...(variant === "slot" ? { "aria-pressed": selected } : {})} {...props} className={`inline-flex min-h-[44px] items-center rounded-xl border-[1.5px] font-bold focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 ${variant === "slot" ? slotClasses : "border-dashed border-brand-700 bg-brand-50 px-3.5 text-sm text-brand-deep"} ${className}`}>{children}</button>;
}
