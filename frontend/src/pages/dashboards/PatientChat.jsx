import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext.jsx";

// Embed the existing Medical Assistant app and share the signed-in patient session.
export default function PatientChat() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const frameRef = useRef(null);
  const assistantUrl = useMemo(() => {
    const url = new URL(import.meta.env.VITE_MEDICAL_ASSISTANT_FRONTEND_URL || "http://localhost:5174");
    url.searchParams.set("embed", "cityhospital");
    url.searchParams.set("parentOrigin", window.location.origin);
    return url;
  }, []);

  // Pass the patient token to the Medical Assistant only after its frame is ready.
  const sendSession = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({
      type: "cityhospital-session",
      token,
      patientId: user?.id,
      patientName: user?.full_name,
      apiUrl: import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1",
    }, assistantUrl.origin);
  }, [assistantUrl, token, user]);

  // Let the embedded app request the session again and handle its sign-out action.
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== assistantUrl.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === "medical-assistant-ready") sendSession();
      if (event.data?.type === "cityhospital-logout") {
        logout();
        navigate("/login", { replace: true });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [assistantUrl, logout, navigate, sendSession]);

  return (
    <iframe
      ref={frameRef}
      title="Medical Assistant"
      src={assistantUrl.toString()}
      onLoad={sendSession}
      className="h-screen w-full border-0 bg-white"
    />
  );
}
