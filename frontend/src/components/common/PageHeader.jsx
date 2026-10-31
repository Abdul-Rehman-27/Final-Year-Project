/** Page title + optional subtitle at the top of a dashboard page. */
export default function PageHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-black sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-1 text-ink-muted">{subtitle}</p>}
    </div>
  );
}
