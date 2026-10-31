import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { authService } from "../services/authService.js";
import { clearSession, loadSession, saveSession } from "../services/session.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);

  const applySession = useCallback((data) => {
    saveSession(data);
    setSession({ token: data.access_token, user: data.user });
    return data.user;
  }, []);

  const login = useCallback(async (payload) => applySession(await authService.login(payload)), [applySession]);
  const register = useCallback(async (payload) => applySession(await authService.register(payload)), [applySession]);

  const logout = useCallback(() => {
    clearSession();
    setSession({ token: null, user: null });
  }, []);

  const value = useMemo(
    () => ({ user: session.user, token: session.token, isAuthenticated: !!session.token, login, register, logout }),
    [session, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
