import { useCallback, useEffect, useRef, useState } from "react";
import { doctorPortalService } from "../services/doctorPortalService.js";

export default function useDoctorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(false);

  const reload = useCallback(async () => {
    if (mounted.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await doctorPortalService.getDashboard();
      if (mounted.current) setData(result);
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => { mounted.current = false; };
  }, [reload]);

  return { data, loading, error, reload, refresh: reload };
}
