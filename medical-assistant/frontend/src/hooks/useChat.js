import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { detectLanguage } from "../lib/language";
import { requestPortalAction } from "../lib/portalBridge";

const SESSION_KEY = "medical-assistant-session-id";

// The assistant stores UTC timestamps without a zone ("2026-11-28 04:30:00"); CityHospital sends ISO with a zone.
export function parseDate(value) {
  if (!value) return null;
  const text = String(value);
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text.replace(" ", "T") : `${text.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalise(message) {
  return { ...message, language: message.language || detectLanguage(message.content || "") };
}

/**
 * Conversation state for the embedded chat: history list, the open conversation, sending, stopping
 * and the "replying to" chip. A new chat is only created on the server when its first message is sent,
 * so clicking "New chat" never leaves empty conversations in the history.
 */
export default function useChat({ patientId, stoppedText }) {
  const sessionKey = `${SESSION_KEY}:${patientId}`;
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const doneActions = useRef(new Set());   // NEW (step 4): an action id is handed to the portal once, even if the same reply is shown again
  const openToken = useRef(0);

  const refreshList = useCallback(async () => {
    try {
      const rows = await api(`/api/v1/chat/sessions?patient_id=${encodeURIComponent(patientId)}`);
      setConversations(Array.isArray(rows) ? rows : []);
    } catch {
      /* the list is a convenience; the chat itself still works */
    }
  }, [patientId]);

  const openConversation = useCallback(async (id) => {
    const token = ++openToken.current;
    setError("");
    setReplyTo(null);
    try {
      const existing = await api(`/api/v1/chat/sessions/${encodeURIComponent(id)}?patient_id=${encodeURIComponent(patientId)}`);
      if (token !== openToken.current) return;
      setMessages((existing.messages || []).map(normalise));
      setConversationId(id);
      localStorage.setItem(sessionKey, String(id));
    } catch (reason) {
      if (token !== openToken.current) return;
      localStorage.removeItem(sessionKey);
      setError(reason.message);
    }
  }, [patientId, sessionKey]);

  // First load: fill the history list and reopen the conversation this patient had open last time.
  useEffect(() => {
    refreshList();
    const saved = localStorage.getItem(sessionKey);
    if (saved) openConversation(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const newChat = useCallback(() => {
    openToken.current += 1;
    localStorage.removeItem(sessionKey);
    setConversationId(null);
    setMessages([]);
    setReplyTo(null);
    setError("");
  }, [sessionKey]);

  const send = useCallback(async (rawText) => {
    const text = rawText.trim();
    if (!text || waiting) return;
    const reply = replyTo;
    setDraft("");
    setError("");
    setReplyTo(null);
    setMessages((current) => [...current, { role: "user", content: text, reply_to: reply?.text || null }]);
    setWaiting(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let id = conversationId;
      if (!id) {
        const created = await api("/api/v1/chat/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patient_id: patientId }), signal: controller.signal });
        id = created.id;
        setConversationId(id);
        localStorage.setItem(sessionKey, String(id));
      }
      const result = await api(`/api/v1/chat/sessions/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patientId, message: text, reply_to: reply?.text || null }),
        signal: controller.signal,
      });
      const language = result.language || detectLanguage(text);
      setMessages((current) => [...current, { role: "assistant", content: result.answer, structured: result.structured || null, language }]);
      // NEW (step 4): the patient said yes to a booking change. Only a reply that just arrived triggers it (never one loaded from history).
      const action = result.structured?.type === "portal_action" ? result.structured : null;
      if (action && !doneActions.current.has(action.action_id)) {
        doneActions.current.add(action.action_id);
        const outcome = await requestPortalAction(action.action_id, action.action, action.params);
        const reported = await api(`/api/v1/chat/sessions/${encodeURIComponent(id)}/action-result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action_id: action.action_id, ok: outcome.ok, appointment_id: outcome.appointmentId, code: outcome.ok ? null : outcome.code }),
        });
        setMessages((current) => [...current, { role: "assistant", content: reported.answer, structured: reported.structured || null, language: reported.language || language }]);
      }
    } catch (reason) {
      if (reason.name === "AbortError") setMessages((current) => [...current, { role: "assistant", content: stoppedText }]);
      else setError(reason.message || "The service is unavailable. Please try again.");
    } finally {
      abortRef.current = null;
      setWaiting(false);
      refreshList();
    }
  }, [conversationId, patientId, refreshList, replyTo, sessionKey, stoppedText, waiting]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { conversations, conversationId, messages, draft, setDraft, replyTo, setReplyTo, waiting, error, send, stop, newChat, openConversation };
}
