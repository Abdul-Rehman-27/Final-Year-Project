/** Props: `className` adds layout styles to the card. */
export default function PortalCard({ className = "", children }) {
  return <section className={`rounded-[18px] border border-line bg-white p-[22px] ${className}`}>{children}</section>;
}
