import Card from "./Card.jsx";

/** Big number with a label, e.g. 24 / Doctors. */
export default function StatCard({ value, label }) {
  return (
    <Card className="p-6">
      <p className="text-4xl font-black text-brand-700">{value}</p>
      <p className="mt-1 text-ink-muted">{label}</p>
    </Card>
  );
}
