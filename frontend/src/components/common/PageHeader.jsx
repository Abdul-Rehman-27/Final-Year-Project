import LanguageSwitch from "./LanguageSwitch.jsx";

/** Page title + optional subtitle at the top of a dashboard page. */
export default function PageHeader({ title, subtitle, actions, showLanguage = false }) {
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-3xl font-black sm:text-4xl">{title}</h1>{subtitle && <p className="mt-1 text-ink-muted">{subtitle}</p>}</div>
        {(actions || showLanguage) && <div className="flex shrink-0 items-center gap-3">{actions}<div className="hidden lg:block">{showLanguage && <LanguageSwitch />}</div></div>}
      </div>
    </div>
  );
}
