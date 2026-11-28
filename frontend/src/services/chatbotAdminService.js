import api from "./api.js";

export const chatbotAdminService = {
  // Load the page snapshot from the existing admin monitor endpoint.
  async getMonitoring() {
    const { data } = await api.get("/admin/chatbot/monitoring");
    return data;
  },
  // Load provider models and their per-model usage totals.
  async getModels() {
    const { data } = await api.get("/admin/models");
    return data;
  },
  // Read one model's graph and detail metrics for a selected period.
  async getModelUsage(modelId, range) {
    const { data } = await api.get(`/admin/models/${modelId}/usage`, { params: { range } });
    return data;
  },
  // Download one model's usage report as a CSV file.
  async downloadUsage(modelId, range) {
    const { data } = await api.get(`/admin/models/${modelId}/usage/export`, { params: { range }, responseType: "blob" });
    return data;
  },
  // Change the admin-enabled flag for one service.
  async updateService(serviceId, enabled) {
    const { data } = await api.patch(`/admin/services/${serviceId}`, { enabled });
    return data;
  },
  // Save the active model, fallback behavior and monthly token limit.
  async updateSettings(settings) {
    const { data } = await api.patch("/admin/settings", settings);
    return data;
  },
  // Restore GroqCloud after the chatbot moved to its local fallback.
  async returnToPrimary() {
    const { data } = await api.post("/admin/fallback/return-to-primary");
    return data;
  },
};
