const TONES = {
  success: "bg-brand-tint text-brand-800",
  neutral: "bg-gray-100 text-gray-600",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
};

/** Small rounded label, e.g. Active / Inactive. */
export default function Badge({ children, tone = "neutral" }) {
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${TONES[tone]}`}>{children}</span>;
}
