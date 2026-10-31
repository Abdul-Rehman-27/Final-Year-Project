/**
 * Simple reusable table.
 * columns: [{ header: "Name", render: (row) => row.name, className?: "text-end" }]
 */
export default function DataTable({ columns, rows, rowKey = "id", loading, loadingText, emptyText }) {
  if (loading) return <p className="px-6 py-8 text-ink-muted">{loadingText}</p>;
  if (!rows.length) return <p className="px-6 py-8 text-ink-muted">{emptyText}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-start">
        <thead>
          <tr className="border-b border-line text-sm text-ink-muted">
            {columns.map((col, i) => (
              <th key={i} className={`px-6 py-3 text-start font-bold ${col.className || ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]} className="border-b border-line last:border-0">
              {columns.map((col, i) => (
                <td key={i} className={`px-6 py-4 ${col.className || ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
