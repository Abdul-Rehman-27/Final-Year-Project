export function detectLanguage(text = "") {
  return /[\u0600-\u06ff]/.test(text) ? "urdu" : "english";
}
