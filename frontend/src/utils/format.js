export const pct = (v) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);
export const score = (v) => (v == null ? "-" : v.toFixed(3));
/** gap in percentage points, always with a sign: +12.3 */
export const signed = (v) => (v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);
/** Badge tone for an Urdu-English gap (bigger gap = worse). */
export const gapTone = (v) => (v == null ? "neutral" : v >= 15 ? "danger" : v >= 8 ? "warning" : "success");
