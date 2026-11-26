/** Props: `tone` selects success, warning, neutral, or danger colours. */
export default function PortalBadge({ tone = "neutral", children }) {
  const tones = { success: "bg-brand-tint text-brand-deep", warning: "bg-[#FEF3C7] text-[#8A3F0A]", neutral: "bg-[#EEF3F2] text-ink-soft", danger: "bg-[#FEE2E2] text-[#991B1B]" };
  return <span className={`rounded-full px-3 py-1 text-[13px] font-bold ${tones[tone]}`}>{children}</span>;
}
