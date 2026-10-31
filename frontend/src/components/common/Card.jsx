/** White rounded box used for stats, tables and forms. */
export default function Card({ children, className = "" }) {
  return <div className={`rounded-2xl border border-line bg-white ${className}`}>{children}</div>;
}
