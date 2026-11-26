import MicroLabel from "../MicroLabel.jsx";

/** Props: `items` renders six labelled values in a three-column print panel. */
export default function PrintInfoPanel({ items, className = "" }) {
  return <div className={`grid grid-cols-3 gap-x-5 gap-y-4 rounded-[10px] bg-[#F1F6F5] p-4 ${className}`}>{items.map(({ label, value }) => <div key={label}><MicroLabel className="text-[10px] tracking-[1px] text-[#3F5954]">{label}</MicroLabel><p className="mt-0.5 text-[13.5px] font-bold">{value}</p></div>)}</div>;
}
