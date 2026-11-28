import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import PatientPageHeader from "../../components/patient/PatientPageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { patientPortalService } from "../../services/patientPortalService.js";
import { ACTION_REQUEST, parseActionRequest, rejectedAction, runAction } from "../../utils/assistantBridge.js";

// Embed the existing Medical Assistant app and share the signed-in patient session.
// The page title and subtitle belong to the portal; the iframe draws only the history and chat cards.
// NEW: the iframe is sized to the space left under the page header, so the page itself never scrolls
// and the chat scrolls inside the frame. Below this height the page is allowed to scroll instead.
const MIN_FRAME_HEIGHT = 480;

export default function PatientChat() {
  const { token, user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const frameRef = useRef(null);
  const handledActions = useRef(new Set());   // NEW (step 4): a request id is carried out once, however often it is sent
  const [frameHeight, setFrameHeight] = useState(MIN_FRAME_HEIGHT);
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
      // NEW (step 4): the chat asks this page to book / move / cancel. This page uses the signed-in patient's own session,
      // so the hospital backend applies every booking rule; the frame never gets a way to choose the patient.
      if (event.data?.type === ACTION_REQUEST) {
        const reply = (message) => message && frameRef.current?.contentWindow?.postMessage(message, assistantUrl.origin);
        const request = parseActionRequest(event.data);
        if (!request) { reply(rejectedAction(event.data)); return; }
        if (handledActions.current.has(request.requestId)) return;
        handledActions.current.add(request.requestId);
        runAction(request, patientPortalService).then(reply);
      }
      if (event.data?.type === "cityhospital-logout") {
        logout();
        navigate("/login", { replace: true });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [assistantUrl, logout, navigate, sendSession]);

  // NEW: viewport height - distance from the page top to the frame - the page's bottom padding.
  const fitFrame = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const viewport = window.visualViewport?.height || window.innerHeight;
    const top = frame.getBoundingClientRect().top + window.scrollY;
    const main = frame.closest("main");
    const bottomPad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
    setFrameHeight(Math.max(MIN_FRAME_HEIGHT, Math.floor(viewport - top - bottomPad)));
  }, []);

  useLayoutEffect(() => {
    fitFrame();
    window.addEventListener("resize", fitFrame);
    window.addEventListener("orientationchange", fitFrame);
    window.visualViewport?.addEventListener("resize", fitFrame);
    // Header text can wrap to more lines (narrow screens, long translations) and move the frame down.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fitFrame) : null;
    const header = frameRef.current?.previousElementSibling;
    if (observer && header) observer.observe(header);
    return () => {
      window.removeEventListener("resize", fitFrame);
      window.removeEventListener("orientationchange", fitFrame);
      window.visualViewport?.removeEventListener("resize", fitFrame);
      observer?.disconnect();
    };
  }, [fitFrame]);

  return (
    <>
      <PatientPageHeader title={t("patient.assistant.title")} subtitle={t("patient.assistant.subtitle")} />
      {/* Height is measured (see fitFrame) instead of the old fixed `100vh - 216px` estimate. */}
      <iframe
        ref={frameRef}
        title={t("patient.assistant.title")}
        src={assistantUrl.toString()}
        onLoad={sendSession}
        style={{ height: frameHeight }}
        className="block w-full border-0 bg-transparent"
      />
    </>
  );
}
