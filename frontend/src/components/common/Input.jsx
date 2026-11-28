import { forwardRef } from "react";
import FieldShell, { controlClass } from "./FieldShell.jsx";

const Input = forwardRef(function Input({ id, label, error, optional, optionalText, required, ...props }, ref) {
  return (
    <FieldShell id={id} label={label} error={error} optional={optional} optionalText={optionalText}>
      <input
        id={id}
        ref={ref}
        aria-invalid={!!error}
        aria-required={required}
        aria-describedby={error ? `${id}-error` : undefined}
        className={controlClass(error)}
        {...props}
      />
    </FieldShell>
  );
});

export default Input;
