import api from "./api.js";

function mapPermissionError(error) {
  const code = error?.response?.data?.detail;
  if (["NAME_TAKEN", "CODE_TAKEN", "PERMISSION_NOT_FOUND"].includes(code)) throw Object.assign(new Error(code), { code });
  throw error;
}

export const permissionService = {
  async list() {
    try { return (await api.get("/admin/permissions")).data; }
    catch (error) { mapPermissionError(error); }
  },
  async create(data) {
    try { return (await api.post("/admin/permissions", data)).data; }
    catch (error) { mapPermissionError(error); }
  },
  async update(id, data) {
    try { return (await api.patch(`/admin/permissions/${id}`, data)).data; }
    catch (error) { mapPermissionError(error); }
  },
  async remove(id) {
    try { await api.delete(`/admin/permissions/${id}`); }
    catch (error) { mapPermissionError(error); }
  },
};
