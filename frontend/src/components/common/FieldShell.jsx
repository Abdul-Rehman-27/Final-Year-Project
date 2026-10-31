/** Label + control + error message, shared by Input / Select / PasswordInput. */
export const controlClass = (error) =>
  `w-full rounded-xl border bg-white px-4 py-3 text-base text-ink outline-none transition-colors
   focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20
   ${error ? "border-red-500" : "border-line"}`;

export default function FieldShell({ id, label, error, optional, optionalText, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
        {optional && (
          <span className="ms-1 text-sm font-normal text-ink-muted">({optionalText})</span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
