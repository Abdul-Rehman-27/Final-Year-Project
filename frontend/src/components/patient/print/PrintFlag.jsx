/** Props: `className` controls the flag's font size and placement. */
export default function PrintFlag({ className = "", children }) {
  return <span className={`inline-block rounded-full bg-brand-tint px-2.5 py-0.5 font-bold text-brand-deep ${className}`}>{children}</span>;
}
