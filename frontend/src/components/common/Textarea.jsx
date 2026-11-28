import { forwardRef } from "react";
import FieldShell, { controlClass } from "./FieldShell.jsx";

const Textarea = forwardRef(function Textarea({ id, label, error, optional, optionalText, rows = 3, className = "", ...props }, ref) {
  return (
    <FieldShell id={id} label={label} error={error} optional={optional} optionalText={optionalText}>
      <textarea
        id={id}
        ref={ref}
        rows={rows}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${controlClass(error)} resize-y ${className}`}
        {...props}
      />
    </FieldShell>
  );
});

export default Textarea;
