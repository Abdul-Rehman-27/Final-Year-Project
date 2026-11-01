import { INITIAL_ROLES } from "../data/mockRbac.js";
import { slugify } from "../utils/slug.js";
import { staffService } from "./staffService.js";

/**
 * MOCK role service. A role = { id, key, name, description, system, permissionIds }.
 * Backend later: /admin/roles (CRUD) and PUT /admin/roles/{id}/permissions.
 * Throws { code: "NAME_TAKEN" } | { code: "IN_USE" } | { code: "SYSTEM" }.
 */
let roles = INITIAL_ROLES.map((r) => ({ ...r }));
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const nameTaken = (name, ignoreId) => roles.some((r) => r.id !== ignoreId && r.name.toLowerCase() === name.toLowerCase());

export const roleService = {
  async list() {
    await wait();
    return roles.map((r) => ({ ...r, memberCount: staffService.countByRole(r.key) }));
  },

  async create({ name, description }) {
    await wait();
    if (nameTaken(name)) throw { code: "NAME_TAKEN" };
    let key = slugify(name) || `role-${Date.now()}`;
    while (roles.some((r) => r.key === key)) key += "-2";
    const role = { id: Date.now(), key, name, description, system: false, permissionIds: [] };
    roles = [...roles, role];
    return role;
  },

  async update(id, { name, description }) {
    await wait();
    const current = roles.find((r) => r.id === id);
    const newName = current.system ? current.name : name; // system role names are fixed
    if (nameTaken(newName, id)) throw { code: "NAME_TAKEN" };
    roles = roles.map((r) => (r.id === id ? { ...r, name: newName, description } : r));
    return roles.find((r) => r.id === id);
  },

  /** Replace the full list of enabled permissions of a role. */
  async setPermissions(id, permissionIds) {
    await wait();
    roles = roles.map((r) => (r.id === id ? { ...r, permissionIds: [...permissionIds] } : r));
    return roles.find((r) => r.id === id);
  },

  async remove(id) {
    await wait();
    const role = roles.find((r) => r.id === id);
    if (role.system) throw { code: "SYSTEM" };
    if (staffService.countByRole(role.key) > 0) throw { code: "IN_USE" };
    roles = roles.filter((r) => r.id !== id);
  },

  /** Called when a permission is deleted: take it away from every role. */
  detachPermission(permissionId) {
    roles = roles.map((r) => ({ ...r, permissionIds: r.permissionIds.filter((p) => p !== permissionId) }));
  },

  countUsingPermission: (permissionId) => roles.filter((r) => r.permissionIds.includes(permissionId)).length,

  /** For later use by the app: does this role key have this permission code? (needs the permission list) */
  can: (roleKey, permissionId) => !!roles.find((r) => r.key === roleKey)?.permissionIds.includes(permissionId),
};
