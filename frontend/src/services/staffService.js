import api from "./api.js";

function mapAdminError(error) {
  const code = error?.response?.data?.detail;
  if (["EMAIL_TAKEN", "DEPARTMENT_NOT_FOUND", "ROLE_NOT_FOUND", "SELF_LOCKOUT"].includes(code)) {
    throw Object.assign(new Error(code), { code });
  }
  throw error;
}

const payloadFor = (data) => ({
  ...data,
  departmentId: Number(data.departmentId),
  fee: data.fee === "" || data.fee == null ? null : Number(data.fee),
});

export const staffService = {
  async list() {
    try {
      return (await api.get("/admin/staff")).data;
    } catch (error) {
      mapAdminError(error);
    }
  },
  async create(data) {
    try {
      return (await api.post("/admin/staff", payloadFor(data))).data;
    } catch (error) {
      mapAdminError(error);
    }
  },
  async update(id, data) {
    try {
      return (await api.patch(`/admin/staff/${id}`, payloadFor(data))).data;
    } catch (error) {
      mapAdminError(error);
    }
  },
};
