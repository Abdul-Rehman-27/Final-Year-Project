import en from "./en.js";
import ur from "./ur.js";
import doctorUr from "./doctorUr.js";

export const translations = { en, ur: { ...ur, doctor: doctorUr } };
export const RTL_LANGS = ["ur"];

/** Look up "auth.fields.email" in a translation tree. Falls back to the key itself. */
export function translate(lang, key) {
  const value = key.split(".").reduce((node, part) => (node ? node[part] : undefined), translations[lang]);
  return typeof value === "string" ? value : key;
}
