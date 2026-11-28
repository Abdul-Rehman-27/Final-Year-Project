import api from "./api.js";

function mapDepartmentError(error) {
  const code = error?.response?.data?.detail;
  if (["NAME_TAKEN", "IN_USE", "DEPARTMENT_NOT_FOUND"].includes(code)) throw Object.assign(new Error(code), { code });
  throw error;
}

export const departmentService = {
  async list() {
    try { return (await api.get("/admin/departments")).data; }
    catch (error) { mapDepartmentError(error); }
  },
  async create(data) {
    try { return (await api.post("/admin/departments", data)).data; }
    catch (error) { mapDepartmentError(error); }
  },
  async update(id, data) {
    try { return (await api.patch(`/admin/departments/${id}`, data)).data; }
    catch (error) { mapDepartmentError(error); }
  },
  async remove(id) {
    try { await api.delete(`/admin/departments/${id}`); }
    catch (error) { mapDepartmentError(error); }
  },
};
