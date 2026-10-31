import { useLanguage } from "../../context/LanguageContext.jsx";

const ROLES = ["patient", "doctor", "admin"];

/** "I am a  [Patient | Doctor | Admin]" segmented control. */
export default function RoleSelector({ value, onChange }) {
  const { t } = useLanguage();
  return (
    <div>
      <p id="role-label" className="mb-1.5 text-sm font-bold">
        {t("auth.iAm")}
      </p>
      <div role="radiogroup" aria-labelledby="role-label" className="grid grid-cols-3 overflow-hidden rounded-xl border border-line">
        {ROLES.map((role) => {
          const active = value === role;
          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(role)}
              className={`py-3 text-base font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600
                ${active ? "bg-brand-700 text-white" : "bg-white text-ink-muted hover:bg-brand-50"}
                ${role !== "patient" ? "border-s border-line" : ""}`}
            >
              {t(`auth.roles.${role}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
