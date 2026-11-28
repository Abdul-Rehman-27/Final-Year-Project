import { useEffect, useMemo, useRef, useState } from "react";
import { mmss } from "../../utils/datetime.js";

export default function GraceCountdown({ graceEndsAt, serverOffset = 0, onZero }) {
  const [now, setNow] = useState(Date.now());
  const zeroFor = useRef(null);
  const deadline = useMemo(() => Date.parse(graceEndsAt), [graceEndsAt]);
  const remaining = Math.max(0, deadline - (now + serverOffset));

  useEffect(() => {
    setNow(Date.now());
    zeroFor.current = null;
  }, [graceEndsAt]);

  useEffect(() => {
    if (!Number.isFinite(deadline) || remaining <= 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline, remaining > 0]);

  useEffect(() => {
    if (!Number.isFinite(deadline) || remaining > 0 || zeroFor.current === graceEndsAt) return;
    zeroFor.current = graceEndsAt;
    onZero?.();
  }, [deadline, graceEndsAt, onZero, remaining]);

  return mmss(remaining);
}
