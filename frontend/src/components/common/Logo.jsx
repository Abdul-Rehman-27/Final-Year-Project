export default function Logo({ name, light = false }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${light ? "bg-white" : "bg-brand-700"}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className={`h-6 w-6 ${light ? "text-brand-700" : "text-white"}`} fill="currentColor">
          <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />
        </svg>
      </span>
      <span className={`text-xl font-bold ${light ? "text-white" : "text-brand-700"}`}>{name}</span>
    </div>
  );
}
