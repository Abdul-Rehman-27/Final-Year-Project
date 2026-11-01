const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Download rows (array of arrays) as a CSV file. A BOM is added so Excel shows Urdu text correctly. */
export function downloadCsv(filename, rows) {
  const text = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
