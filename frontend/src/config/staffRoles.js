// Roles are now defined by the admin (Admin > Roles). The five below are the built-in "system" roles
// (see data/mockRbac.js); the Add/Edit staff form reads the live list from roleService.
export const SYSTEM_ROLES = ["doctor", "receptionist", "pharmacist", "nurse", "admin"];
export const STAFF_STATUSES = ["active", "inactive"];
