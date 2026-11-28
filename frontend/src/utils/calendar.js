/** Month grid helpers (weeks start on Monday, matching the backend's weekday numbers). */
export function monthKey(year, month) { return `${year}-${String(month).padStart(2, "0")}`; }
export function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return monthKey(Math.floor(index / 12), (index % 12) + 1);
}
export function daysInMonth(key) { const [y, m] = key.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
/** Weeks (arrays of 7) of `YYYY-MM-DD` strings or null for padding cells. */
export function monthGrid(key) {
  const [y, m] = key.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null)];
  for (let d = 1; d <= daysInMonth(key); d += 1) cells.push(`${key}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
/** Visual kind of a day from the month overview row: normal | modified | extra | off | closed. */
export function dayKind(row) {
  if (!row) return "closed";
  if (row.source === "leave") return "off";
  if (row.source === "custom_hours") return "modified";
  if (row.source === "extra_session") return "extra";
  return row.is_working ? "normal" : "closed";
}
