export default function Alert({ children, type = "error" }) {
  const styles =
    type === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-brand-200 bg-brand-50 text-brand-800";
  return (
    <div role={type === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
