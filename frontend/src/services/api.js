import axios from "axios";
import { clearSession, loadSession } from "./session.js";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1",
  timeout: 15000,
});

// Attach the JWT to every request
api.interceptors.request.use((config) => {
  const { token } = loadSession();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Expired/invalid token on a protected call -> drop the session
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || "";
    if (err.response?.status === 401 && !url.startsWith("/auth/login")) {
      clearSession();
    }
    return Promise.reject(err);
  }
);

export default api;
