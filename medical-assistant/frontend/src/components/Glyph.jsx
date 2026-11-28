export default function Glyph({ children, className = "" }) {
  return <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center ${className}`}>{children}</span>;
}
