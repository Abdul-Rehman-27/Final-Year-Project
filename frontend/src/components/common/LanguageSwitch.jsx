import { useLanguage } from "../../context/LanguageContext.jsx";

const OPTIONS = [
  { code: "en", label: "EN" },
  { code: "ur", label: "اردو" },
];

/** EN | اردو pill toggle, as in the prototype. */
export default function LanguageSwitch() {
  const { lang, setLang } = useLanguage();
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-line bg-white p-0.5" dir="ltr">
      {OPTIONS.map((o) => (
        <button
          key={o.code}
          type="button"
          onClick={() => setLang(o.code)}
          aria-pressed={lang === o.code}
          className={`rounded-full px-3 py-1 text-sm font-bold transition-colors ${
            lang === o.code ? "bg-brand-700 text-white" : "text-ink hover:bg-brand-50"
          } ${o.code === "ur" ? "font-urdu" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
