const SIZES = { sm: "h-10 w-10 text-sm", lg: "h-20 w-20 text-2xl" };

// "Dr. Sara Khan" -> "SK"
const initials = (name = "") =>
  name
    .replace(/^dr\.?\s+/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

/**
 * Round profile picture.
 *  - photo        when `src` is given
 *  - initials     when there is no photo but a `name`
 *  - grey person  (dummy picture) when there is neither
 */
export default function Avatar({ src, name, size = "sm" }) {
  const base = `shrink-0 rounded-full ${SIZES[size]}`;
  if (src) return <img src={src} alt={name} className={`${base} object-cover`} />;

  const text = initials(name);
  if (text) {
    return (
      <span aria-hidden="true" className={`${base} flex items-center justify-center bg-brand-tint font-bold text-brand-700`}>
        {text}
      </span>
    );
  }

  // Dummy person: head + shoulders, clipped by the round background
  return (
    <span role="img" aria-label="No photo" className={`${base} overflow-hidden bg-gray-200`}>
      <svg viewBox="0 0 24 24" className="h-full w-full text-gray-400" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="9" r="4.2" />
        <path d="M3.5 24c0-5 3.8-8.2 8.5-8.2s8.5 3.2 8.5 8.2z" />
      </svg>
    </span>
  );
}
