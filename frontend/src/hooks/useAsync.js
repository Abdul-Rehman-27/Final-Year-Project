import { useCallback, useEffect, useRef, useState } from "react";

/** Runs `loader()` on mount and when `deps` change. Returns { data, error, loading, reload }. */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useRef(0);
  const reload = useCallback(() => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    return Promise.resolve().then(loader).then(
      (data) => { if (id === run.current) setState({ data, error: null, loading: false }); return data; },
      (error) => { if (id === run.current) setState({ data: null, error, loading: false }); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); return () => { run.current += 1; }; }, [reload]);
  return { ...state, reload };
}
