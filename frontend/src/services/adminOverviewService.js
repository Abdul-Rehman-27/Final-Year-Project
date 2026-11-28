import api from "./api.js";

export const adminOverviewService = {
  async getStats() {
    return (await api.get("/admin/overview")).data;
  },
};
