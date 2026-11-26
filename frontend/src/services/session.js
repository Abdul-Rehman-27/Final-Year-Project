// Small wrapper around localStorage so authenticated print views can open in a new tab.
// Always try/catch: storage can be blocked.
const KEY = "ch_session";

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    // Preserve a session created before printable pages used shared browser storage.
    const legacyRaw = sessionStorage.getItem(KEY);
    if (legacyRaw) {
      localStorage.setItem(KEY, legacyRaw);
      return JSON.parse(legacyRaw);
    }
  } catch {
    /* ignore corrupt/blocked storage */
  }
  return { token: null, user: null };
}

export function saveSession(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ token: data.access_token, user: data.user }));
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
