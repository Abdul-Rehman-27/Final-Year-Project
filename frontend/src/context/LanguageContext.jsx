import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { RTL_LANGS, translate } from "../i18n/index.js";

const LanguageContext = createContext(null);
const STORAGE_KEY = "ch_lang";

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "ur" ? "ur" : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(initialLang);

  // Keep <html lang/dir> in sync so Tailwind RTL + the Urdu font apply globally
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS.includes(lang) ? "rtl" : "ltr";
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage unavailable - ignore */
    }
  }, [lang]);

  const t = useCallback((key) => translate(lang, key), [lang]);
  const value = useMemo(() => ({ lang, setLang, t, isRtl: RTL_LANGS.includes(lang) }), [lang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
