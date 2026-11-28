/** "Lab Technician" -> "lab-technician" (used as the stable key of a role). */
export const slugify = (v = "") =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** "Create Report" -> "create_report" (suggested code of a permission). */
export const toCode = (v = "") =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
