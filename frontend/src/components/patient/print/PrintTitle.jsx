/** Props: `children`, `size`, and `className` render a centered document title. */
export default function PrintTitle({ children, size = "15px", className = "" }) {
  return <h1 style={{ fontSize: size }} className={`text-center font-bold uppercase tracking-[7px] text-brand-700 ${className}`}>{children}</h1>;
}
