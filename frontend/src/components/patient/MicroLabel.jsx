/** Props: `as` and `className` support semantic, recoloured micro-labels. */
export default function MicroLabel({ as: Component = "p", className = "", children, ...props }) {
  return <Component {...props} className={`text-[12px] font-bold uppercase tracking-[0.8px] text-ink-soft ${className}`}>{children}</Component>;
}
