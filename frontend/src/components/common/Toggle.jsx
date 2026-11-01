/** On/off switch (role="switch"). Works in both LTR and RTL because it uses logical margins. */
export default function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-60
        ${checked ? "bg-brand-700" : "bg-gray-300"}`}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-white shadow transition-[margin] ${
          checked ? "ms-[1.375rem]" : "ms-0.5"
        }`}
      />
    </button>
  );
}
