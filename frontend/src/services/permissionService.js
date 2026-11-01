import { INITIAL_PERMISSIONS } from "../data/mockRbac.js";
import { roleService } from "./roleService.js";

/**
 * MOCK permission service. A permission = { id, name, code, description }.
 * Backend later: GET/POST /admin/permissions, PUT/DELETE /admin/permissions/{id}.
 * Throws { code: "NAME_TAKEN" } or { code: "CODE_TAKEN" }.
 */
let permissions = [...INITIAL_PERMISSIONS];
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

function assertUnique({ name, code }, ignoreId) {
  const others = permissions.filter((p) => p.id !== ignoreId);
  if (others.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw { code: "NAME_TAKEN" };
  if (others.some((p) => p.code === code)) throw { code: "CODE_TAKEN" };
}

export const permissionService = {
  async list() {
    await wait();
    return permissions.map((p) => ({ ...p, roleCount: roleService.countUsingPermission(p.id) }));
  },

  async create(data) {
    await wait();
    assertUnique(data);
    const permission = { id: Date.now(), ...data };
    permissions = [...permissions, permission];
    return permission;
  },

  async update(id, data) {
    await wait();
    assertUnique(data, id);
    permissions = permissions.map((p) => (p.id === id ? { ...p, ...data } : p));
    return permissions.find((p) => p.id === id);
  },

  /** Deleting a permission also removes it from every role that had it enabled. */
  async remove(id) {
    await wait();
    permissions = permissions.filter((p) => p.id !== id);
    roleService.detachPermission(id);
  },
};
