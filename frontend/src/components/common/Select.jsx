import { forwardRef } from "react";
import FieldShell, { controlClass } from "./FieldShell.jsx";

const Select = forwardRef(function Select({ id, label, error, optional, optionalText, required, children, ...props }, ref) {
  return (
    <FieldShell id={id} label={label} error={error} optional={optional} optionalText={optionalText}>
      <select
        id={id}
        ref={ref}
        aria-invalid={!!error}
        aria-required={required}
        aria-describedby={error ? `${id}-error` : undefined}
        className={controlClass(error)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
});

export default Select;
