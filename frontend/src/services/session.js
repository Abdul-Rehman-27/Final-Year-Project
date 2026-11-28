const KEY = "ch_session";
const HANDOFF_KEY = "ch_session_handoff";
const HANDOFF_TTL_MS = 15000;

let memorySession = null;

function read(storageName, key) {
  try {
    return { available: true, value: globalThis[storageName].getItem(key) };
  } catch {
    return { available: false, value: null };
  }
}

function remove(storageName, key) {
  try {
    globalThis[storageName].removeItem(key);
  } catch {
    /* storage can be blocked */
  }
}

function parseSession(raw) {
  try {
    const session = JSON.parse(raw);
    if (session?.token) return { token: session.token, user: session.user ?? null };
  } catch {
    /* corrupt session */
  }
  return null;
}

function saveToSessionStorage(session) {
  try {
    globalThis.sessionStorage.setItem(KEY, JSON.stringify(session));
    memorySession = null;
    return true;
  } catch {
    memorySession = session;
    return false;
  }
}

export function loadSession() {
  // Never migrate the old persistent session. Removing it also clears stuck logins.
  remove("localStorage", KEY);

  const stored = read("sessionStorage", KEY);
  if (stored.available) {
    if (stored.value) {
      const session = parseSession(stored.value);
      if (session) return session;
      remove("sessionStorage", KEY);
    }
  } else if (memorySession) {
    return memorySession;
  }

  const handoff = read("localStorage", HANDOFF_KEY);
  if (handoff.value) {
    try {
      const { session, expires } = JSON.parse(handoff.value);
      const validSession = session?.token ? { token: session.token, user: session.user ?? null } : null;
      if (validSession && Date.now() < expires) {
        saveToSessionStorage(validSession);
        remove("localStorage", HANDOFF_KEY);
        return validSession;
      }
    } catch {
      /* corrupt handoff */
    }
    remove("localStorage", HANDOFF_KEY);
  }

  return { token: null, user: null };
}

export function saveSession(data) {
  saveToSessionStorage({ token: data.access_token, user: data.user });
}

export function clearSession() {
  memorySession = null;
  remove("sessionStorage", KEY);
  remove("localStorage", KEY);
  remove("localStorage", HANDOFF_KEY);
}

export function writeHandoff() {
  const stored = read("sessionStorage", KEY);
  const session = stored.available ? parseSession(stored.value) : memorySession;
  if (!session) return;

  try {
    globalThis.localStorage.setItem(HANDOFF_KEY, JSON.stringify({ session, expires: Date.now() + HANDOFF_TTL_MS }));
  } catch {
    return;
  }

  const cleanup = setTimeout(() => remove("localStorage", HANDOFF_KEY), HANDOFF_TTL_MS);
  cleanup?.unref?.();
}
