import Button from "../common/Button.jsx";

const FIELDS = [
  { key: "medicine", label: "doctor.rx.medicine", maxLength: 100 },
  { key: "dosage", label: "doctor.rx.dosage", maxLength: 60 },
  { key: "timing", label: "doctor.rx.timing", maxLength: 80 },
];

export default function MedicineRowsEditor({ rows, onChange, onAdd, onRemove, errors, t }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="text-start text-xs font-bold uppercase tracking-[.08em] text-ink-muted">
              <th scope="col" className="w-12 px-2 py-3">#</th>
              {FIELDS.map(({ key, label }) => <th scope="col" key={key} className="px-2 py-3">{t(label)}</th>)}
              <th scope="col" className="w-14 px-2 py-3"><span className="sr-only">{t("doctor.rx.removeMedicine")}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="px-2 py-3 text-center" dir="ltr">{index + 1}</td>
                {FIELDS.map(({ key, label, maxLength }) => {
                  const error = errors[index]?.[key];
                  const errorId = `medicine-${row.id}-${key}-error`;
                  return (
                    <td key={key} className="px-2 py-3">
                      <input
                        aria-label={`${t(label)} ${index + 1}`}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? errorId : undefined}
                        autoComplete="off"
                        maxLength={maxLength}
                        value={row[key]}
                        onChange={(event) => onChange(index, key, event.target.value)}
                        className={`w-full rounded-xl border bg-white px-3 py-3 text-start text-base text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 ${error ? "border-red-500" : "border-line"}`}
                      />
                      {error && <p id={errorId} role="alert" className="mt-1 text-xs font-semibold text-red-700">{t(error)}</p>}
                    </td>
                  );
                })}
                <td className="px-2 py-3">
                  <button
                    type="button"
                    aria-label={t("doctor.rx.removeMedicine")}
                    disabled={rows.length === 1}
                    onClick={() => onRemove(index)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-ink hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="m6 6 12 12M18 6 6 18" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button className="mt-4" variant="secondary" fullWidth={false} disabled={rows.length >= 10} onClick={onAdd}>
        + {t("doctor.rx.addMedicine")}
      </Button>
    </div>
  );
}
