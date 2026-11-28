import api from "./api.js";

export const auditLogService = {
  async list(params) {
    const { data } = await api.get("/admin/audit-logs", { params });
    return data;
  },
  async export(params) {
    const { data } = await api.get("/admin/audit-logs/export", { params, responseType: "blob" });
    return data;
  },
};
