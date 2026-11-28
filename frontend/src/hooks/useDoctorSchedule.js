import { useCallback, useEffect, useRef, useState } from "react";
import { doctorPortalService } from "../services/doctorPortalService.js";

export default function useDoctorSchedule() {
  const [days, setDays] = useState([]);
  const [initial, setInitial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(false);

  const reload = useCallback(async () => {
    if (mounted.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await doctorPortalService.getSchedule();
      if (mounted.current) {
        setDays(response.days);
        setInitial(response.days);
        setError(null);
      }
      return response.days;
    } catch (err) {
      if (mounted.current) setError(err);
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const save = useCallback(async (nextDays = days) => {
    setSaving(true);
    try {
      const response = await doctorPortalService.putSchedule(nextDays);
      if (mounted.current) {
        setDays(response.days);
        setInitial(response.days);
      }
      return response;
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [days]);

  useEffect(() => {
    mounted.current = true;
    void reload().catch(() => {});
    return () => { mounted.current = false; };
  }, [reload]);

  return {
    days,
    setDays,
    loading,
    saving,
    error,
    save,
    reload,
    dirty: JSON.stringify(days) !== JSON.stringify(initial),
  };
}
