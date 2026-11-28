/** Props: `title` and `subtitle` identify the current patient page. */
export default function PatientPageHeader({ title, subtitle }) {
  return <header className="mb-[22px]"><h1 className="text-[30px] font-bold tracking-[-0.5px] text-ink">{title}</h1><p className="mt-1 text-sm text-ink-soft">{subtitle}</p></header>;
}
