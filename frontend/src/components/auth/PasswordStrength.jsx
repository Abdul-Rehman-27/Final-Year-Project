import { useLanguage } from "../../context/LanguageContext.jsx";
import { PASSWORD_RULES, passwordScore } from "../../utils/validators.js";

const LABELS = ["weak", "weak", "fair", "good", "strong", "strong"];
const COLORS = ["bg-line", "bg-red-500", "bg-amber-500", "bg-yellow-500", "bg-brand-600", "bg-brand-700"];

/** Live strength meter + checklist shown under the "create password" field. */
export default function PasswordStrength({ value = "" }) {
  const { t } = useLanguage();
  if (!value) return null;
  const score = passwordScore(value);

  return (
    <div className="mt-2 space-y-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= score ? COLORS[score] : "bg-line"}`} />
          ))}
        </div>
        <span className="text-xs font-bold text-ink-muted">
          {t("auth.strength.label")}: {t(`auth.strength.${LABELS[score]}`)}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(value);
          return (
            <li key={r.key} className={ok ? "text-brand-700" : "text-ink-muted"}>
              <span aria-hidden="true">{ok ? "✓" : "○"}</span> {t(`auth.rules.${r.key}`)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
