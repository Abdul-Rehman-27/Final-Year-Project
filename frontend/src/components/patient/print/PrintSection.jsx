import MicroLabel from "../MicroLabel.jsx";

/** Props: `title`, `children`, and `className` render a labelled print section. */
export default function PrintSection({ title, children, className = "" }) {
  return <section className={className}><MicroLabel className="text-[10.5px] tracking-[1.2px] text-brand-700">{title}</MicroLabel>{children}</section>;
}
