// Small wrapper around sessionStorage: the login is forgotten when the tab/browser is closed,
// so the login screen is shown again next time. Always try/catch: storage can be blocked.
const KEY = "ch_session";

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt/blocked storage */
  }
  return { token: null, user: null };
}

export function saveSession(data) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token: data.access_token, user: data.user }));
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
