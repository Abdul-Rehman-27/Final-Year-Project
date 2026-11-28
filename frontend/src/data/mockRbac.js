// Sample data used until the backend roles / permissions / departments APIs are ready.

export const INITIAL_PERMISSIONS = [
  { id: 1, name: "View", code: "view", description: "See records and pages" },
  { id: 2, name: "Create", code: "create", description: "Add new records" },
  { id: 3, name: "Edit", code: "edit", description: "Change existing records" },
  { id: 4, name: "Delete", code: "delete", description: "Remove records" },
];

// `key` is what a staff member stores in `role`. System roles cannot be deleted (their names are translated).
export const INITIAL_ROLES = [
  { id: 1, key: "doctor", name: "Doctor", description: "", system: true, permissionIds: [1, 2, 3] },
  { id: 2, key: "receptionist", name: "Receptionist", description: "", system: true, permissionIds: [1, 2, 3] },
  { id: 3, key: "pharmacist", name: "Pharmacist", description: "", system: true, permissionIds: [1, 2, 3] },
  { id: 4, key: "nurse", name: "Nurse", description: "", system: true, permissionIds: [1, 3] },
  { id: 5, key: "admin", name: "Admin", description: "", system: true, permissionIds: [1, 2, 3, 4] },
];

export const INITIAL_DEPARTMENTS = [
  { id: 1, name: "Cardiology", description: "Heart and blood vessel care" },
  { id: 2, name: "Pediatrics", description: "Children's health" },
  { id: 3, name: "Dermatology", description: "Skin, hair and nails" },
  { id: 4, name: "Pharmacy", description: "Medicines and dispensing" },
  { id: 5, name: "Nursing", description: "Ward and patient care" },
  { id: 6, name: "Reception", description: "Front desk and appointments" },
  { id: 7, name: "Administration", description: "Hospital management" },
];
