/** Props: `variant`, `as`, `to`, and `fullWidth` control button or link presentation. */
export default function PortalButton({ as: Component = "button", variant = "primary", fullWidth = false, className = "", children, type = "button", ...props }) {
  const variants = {
    primary: "bg-brand-700 text-white hover:bg-brand-800",
    onTealLight: "bg-white text-brand-deep hover:bg-white/90",
    onTealOutline: "border border-white/60 bg-transparent text-white hover:bg-white/10",
    secondary: "border border-field bg-white text-ink hover:bg-brand-50",
  };
  return (
    <Component
      {...(Component === "button" ? { type } : {})}
      {...props}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-[18px] text-[15px] font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 ${fullWidth ? "w-full" : ""} ${variants[variant]} ${className}`}
    >
      {children}
    </Component>
  );
}
