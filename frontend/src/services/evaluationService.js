import api from "./api.js";

const base = "/admin/evaluation";

export const evaluationService = {
  async listQueries() {
    return (await api.get(`${base}/queries`)).data;
  },
  async createQuery(data) {
    return (await api.post(`${base}/queries`, data)).data;
  },
  async updateQuery(id, data) {
    return (await api.put(`${base}/queries/${id}`, data)).data;
  },
  async removeQuery(id) {
    await api.delete(`${base}/queries/${id}`);
  },
  async listRuns() {
    return (await api.get(`${base}/runs`)).data;
  },
  async getRun(id) {
    return (await api.get(`${base}/runs/${id}`)).data;
  },
  async deleteRun(id) {
    await api.delete(`${base}/runs/${id}`);
  },
  async cancelRun(id) {
    return (await api.post(`${base}/runs/${id}/cancel`, {}, { timeout: 0 })).data;
  },
  async resumeRun(id) {
    return (await api.post(`${base}/runs/${id}/resume`, {}, { timeout: 0 })).data;
  },
  async listModels() {
    return (await api.get(`${base}/models`)).data;
  },
  async runEvaluation(selection) {
    return (await api.post(`${base}/runs`, selection, { timeout: 0 })).data;
  },
};

/** Compute the existing results screen's metrics from a persisted run. */
export function summarizeRun(run) {
  const acc = (rows) => rows.length ? rows.filter((row) => row.correct).length / rows.length : null;
  const rouge = (rows) => rows.length ? rows.reduce((sum, row) => sum + (row.rougeL || 0), 0) / rows.length : null;
  const side = (language, category) => {
    const rows = run.results.filter((row) => row.lang === language && (!category || row.category === category));
    return { count: rows.length, top1: acc(rows), rougeL: rouge(rows) };
  };
  const gap = (en, ur) => en.top1 == null || ur.top1 == null ? null : (en.top1 - ur.top1) * 100;
  const overall = { en: side("en"), ur: side("ur") };
  overall.gap = gap(overall.en, overall.ur);
  const names = ["triage", "diseaseDetection", "doctorInfo", "appointment", "hospitalInfo"];
  const categories = names.map((category) => {
    const en = side("en", category);
    const ur = side("ur", category);
    return { category, en, ur, gap: gap(en, ur) };
  });
  return { overall, categories, failures: run.results.filter((row) => !row.correct) };
}
