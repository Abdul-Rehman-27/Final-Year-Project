import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

// Polls the assistant's own /health check (moved out of App.jsx; same logic and 30 s interval).
export default function useModelStatus() {
  const [status, setStatus] = useState({ label: "Checking model…", connected: false, checked: false });
  const check = useCallback(async () => {
    try {
      const result = await api("/api/v1/health");
      const groq = result.models.primary.connected;
      const ollama = result.models.fallback.connected;
      setStatus({ label: groq ? "GroqCloud connected" : ollama ? "Ollama fallback ready" : "Models disconnected", connected: groq || ollama, checked: true });
    } catch {
      setStatus({ label: "Service disconnected", connected: false, checked: true });
    }
  }, []);

  useEffect(() => {
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, [check]);

  return status;
}
