import { forwardRef, useState } from "react";
import { useLanguage } from "../../context/LanguageContext.jsx";
import FieldShell, { controlClass } from "./FieldShell.jsx";

const Eye = ({ off }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

/** Password field with a show/hide toggle. */
const PasswordInput = forwardRef(function PasswordInput({ id, label, error, optional, optionalText, required, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const { t } = useLanguage();

  return (
    <FieldShell id={id} label={label} error={error} optional={optional} optionalText={optionalText}>
      <div className="relative" dir="ltr">
        <input
          id={id}
          ref={ref}
          type={visible ? "text" : "password"}
          dir="ltr"
          aria-invalid={!!error}
          aria-required={required}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${controlClass(error)} pe-12 text-start`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-ink-muted hover:text-brand-700"
        >
          <Eye off={visible} />
        </button>
      </div>
    </FieldShell>
  );
});

export default PasswordInput;
