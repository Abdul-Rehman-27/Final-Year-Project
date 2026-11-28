import { useCallback, useEffect, useRef, useState } from "react";
import { doctorPortalService } from "../services/doctorPortalService.js";

export default function useDoctorQueue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [serverOffset, setServerOffset] = useState(0);
  const mounted = useRef(false);
  const refreshRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const result = await doctorPortalService.getQueue();
      if (mounted.current) {
        setData(result);
        setServerOffset(Date.parse(result.server_now) - Date.now());
        setError(null);
      }
      return result;
    } catch (err) {
      if (mounted.current) setError(err);
      throw err;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  refreshRef.current = refresh;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let timer = null;
    let polling = false;

    const poll = async () => {
      if (!active || document.visibilityState !== "visible" || polling) return;
      polling = true;
      try {
        await refreshRef.current();
      } catch {
        // The hook exposes the error for the screen's retry state.
      } finally {
        polling = false;
        if (active && document.visibilityState === "visible") timer = setTimeout(poll, 10000);
      }
    };
    const onVisibilityChange = () => {
      clearTimeout(timer);
      timer = null;
      if (document.visibilityState === "visible") void poll();
    };

    void poll();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const runAction = useCallback(async (action, ...args) => {
    try {
      const result = await action(...args);
      await refresh();
      return result;
    } catch (err) {
      await refresh().catch(() => {});
      throw err;
    }
  }, [refresh]);

  const checkIn = useCallback((id) => runAction((value) => doctorPortalService.checkIn(value), id), [runAction]);
  const setVisitStatus = useCallback((id, visitStatus) => runAction((value, status) => doctorPortalService.setVisitStatus(value, status), id, visitStatus), [runAction]);

  return { data, loading, error, serverOffset, refresh, checkIn, setVisitStatus };
}
