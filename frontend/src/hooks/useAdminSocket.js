import { useEffect, useRef, useState } from "react";

import { loadSession } from "../services/session.js";

const RETRY_DELAYS = [1000, 2000, 5000, 15000];

// Turn the configured API host into the admin socket URL.
function socketAddress() {
  const apiAddress = new URL(import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1");
  apiAddress.protocol = apiAddress.protocol === "https:" ? "wss:" : "ws:";
  apiAddress.pathname = "/ws/admin/knowledge-base";
  apiAddress.search = "";
  return apiAddress.toString();
}

/** Connect to the admin event stream, answer heartbeats and retry dropped sockets. */
export default function useAdminSocket({ onInitialState, onEvents, onReconnect }) {
  const [connection, setConnection] = useState("reconnecting");
  const callbacks = useRef({ onInitialState, onEvents, onReconnect });
  callbacks.current = { onInitialState, onEvents, onReconnect };

  useEffect(() => {
    const token = loadSession().token;
    if (!token) {
      setConnection("disconnected");
      return undefined;
    }

    let socket;
    let stopped = false;
    let hadConnection = false;
    let retryCount = 0;
    let retryTimer;
    let eventTimer;
    let queuedEvents = [];

    const connect = () => {
      if (stopped) return;
      setConnection("reconnecting");
      socket = new WebSocket(socketAddress());
      socket.onopen = () => socket.send(JSON.stringify({ type: "authenticate", token }));
      socket.onmessage = (message) => {
        let event;
        try {
          event = JSON.parse(message.data);
        } catch {
          return;
        }
        if (event.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
          return;
        }
        if (event.type === "initial_state") {
          const reconnecting = hadConnection;
          hadConnection = true;
          retryCount = 0;
          setConnection("connected");
          callbacks.current.onInitialState?.(event.data);
          if (reconnecting) callbacks.current.onReconnect?.();
          return;
        }
        queuedEvents.push(event);
        if (!eventTimer) {
          eventTimer = window.setTimeout(() => {
            const batch = queuedEvents;
            queuedEvents = [];
            eventTimer = null;
            callbacks.current.onEvents?.(batch);
          }, 1000);
        }
      };
      socket.onclose = (event) => {
        if (stopped) return;
        if (event.code === 4401 || event.code === 4403) {
          setConnection("disconnected");
          return;
        }
        setConnection("reconnecting");
        const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
        retryCount += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(eventTimer);
      socket?.close();
    };
  }, []);

  return connection;
}
