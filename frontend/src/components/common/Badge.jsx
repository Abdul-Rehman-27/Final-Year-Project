const TONES = {
  success: "bg-brand-tint text-brand-800",
  neutral: "bg-gray-100 text-gray-600",
};

/** Small rounded label, e.g. Active / Inactive. */
export default function Badge({ children, tone = "neutral" }) {
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${TONES[tone]}`}>{children}</span>;
}
