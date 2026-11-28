import Card from "../common/Card.jsx";

export default function SummaryCard({ title, warning = false, className = "", children }) {
  const tone = warning ? "border-amber-400 bg-amber-50" : "bg-white";
  return (
    <Card className={`doctor-summary-card h-full p-5 ${tone} ${className}`}>
      <h2 className="text-xs font-bold uppercase tracking-[.08em] text-ink-muted">{title}</h2>
      <div className="mt-3 min-w-0">{children}</div>
    </Card>
  );
}
