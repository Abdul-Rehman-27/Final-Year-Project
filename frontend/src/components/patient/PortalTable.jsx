/** Props: `columns` configures headings and `rows` provides matching object values. */
export default function PortalTable({ columns, rows }) {
  return <table className="w-full border-collapse"><thead><tr>{columns.map((column) => <th key={column.key} scope="col" className="border-b border-line p-2 text-left text-[12px] font-bold uppercase tracking-[0.8px] text-ink-soft">{column.label}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={row.id || rowIndex}>{columns.map((column) => <td key={column.key} className={`border-b border-divider px-2 py-3.5 text-[15px] text-ink ${column.bold ? "font-bold" : ""}`}>{row[column.key]}</td>)}</tr>)}</tbody></table>;
}
