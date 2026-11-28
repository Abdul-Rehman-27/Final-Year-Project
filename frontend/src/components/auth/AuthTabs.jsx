import { useLanguage } from "../../context/LanguageContext.jsx";

/**
 * Log in | Register underline tabs.
 * Only patients can register, so the Register tab is not rendered for doctor/admin.
 */
export default function AuthTabs({ mode, onChange, showRegister }) {
  const { t } = useLanguage();
  const tabs = showRegister ? ["login", "register"] : ["login"];
  return (
    <div role="tablist" className="flex gap-8 border-b border-line">
      {tabs.map((id) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`-mb-px border-b-2 pb-3 text-lg font-bold transition-colors
              ${active ? "border-brand-700 text-brand-700" : "border-transparent text-ink-muted hover:text-brand-700"}`}
          >
            {t(`auth.tabs.${id}`)}
          </button>
        );
      })}
    </div>
  );
}
