import api from "./api.js";

function mapRoleError(error) {
  const code = error?.response?.data?.detail;
  if (["NAME_TAKEN", "IN_USE", "SYSTEM", "ROLE_NOT_FOUND", "PERMISSION_NOT_FOUND"].includes(code)) throw Object.assign(new Error(code), { code });
  throw error;
}

export const roleService = {
  async list() {
    try { return (await api.get("/admin/roles")).data; }
    catch (error) { mapRoleError(error); }
  },
  async create(data) {
    try { return (await api.post("/admin/roles", data)).data; }
    catch (error) { mapRoleError(error); }
  },
  async update(id, data) {
    try { return (await api.patch(`/admin/roles/${id}`, data)).data; }
    catch (error) { mapRoleError(error); }
  },
  async setPermissions(id, permissionIds) {
    try { return (await api.put(`/admin/roles/${id}/permissions`, { permissionIds })).data; }
    catch (error) { mapRoleError(error); }
  },
  async remove(id) {
    try { await api.delete(`/admin/roles/${id}`); }
    catch (error) { mapRoleError(error); }
  },
};
