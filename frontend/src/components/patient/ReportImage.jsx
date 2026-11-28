/** Props: `src`, `alt`, `label`, and `height` render an image or accessible report preview. */
export default function ReportImage({ src, alt, label, height = 220 }) {
  if (src) return <div className="overflow-hidden rounded-[14px] bg-[#1b2523]" style={{ height }}><img src={src} alt={alt} className="h-full w-full object-contain" /></div>;
  return <div role="img" aria-label={alt} className="flex items-center justify-center rounded-[14px] text-sm text-brand-tint" style={{ height, background: "radial-gradient(circle at 50% 45%, #6b7b79, #1b2523)" }}>{label}</div>;
}
