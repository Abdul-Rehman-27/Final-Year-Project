import api from "./api.js";

function wrap(error) {
  const detail = error?.response?.data?.detail;
  const code = error?.response?.status === 422 ? "VALIDATION_ERROR" : (typeof detail === "string" ? detail : error?.request && !error?.response ? "NETWORK" : "GENERIC");
  throw Object.assign(new Error(code), { code });
}

export const hospitalProfileService = {
  get: () => api.get("/admin/hospital-profile").then((r) => r.data).catch(wrap),
  save: (body) => api.put("/admin/hospital-profile", body).then((r) => r.data).catch(wrap),
};
