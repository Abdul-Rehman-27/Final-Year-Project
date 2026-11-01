import { CATEGORIES } from "../config/evaluation.js";
import { INITIAL_QUERIES } from "../data/mockEvaluation.js";

/**
 * MOCK evaluation service. Results are SIMULATED (seeded random numbers, Urdu slightly weaker than English)
 * so the screens can be built and demonstrated. When the real pipeline in /evaluation is ready, replace
 * runEvaluation() with POST /admin/evaluation/runs and list functions with GET calls - the shapes below stay.
 *
 * run = { id, createdAt, results: [{ queryId, lang, category, query, truth, predicted, correct, rougeL }],
 *         summarizer: { rougeL, coverage, allergyRecall } }
 */
let queries = INITIAL_QUERIES.map((q) => ({ ...q }));
let runs = [];
let nextRunId = 1;
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

/** Small deterministic random generator, so the same seed gives the same run. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simulated chance that the top retrieved answer is right, per language and category.
const P_CORRECT = {
  triage: { en: 0.93, ur: 0.8 },
  diseaseDetection: { en: 0.9, ur: 0.72 },
  doctorInfo: { en: 0.94, ur: 0.84 },
  appointment: { en: 0.96, ur: 0.88 },
  hospitalInfo: { en: 0.95, ur: 0.86 },
};

function buildRun(source, seed, createdAt) {
  const rand = mulberry32(seed);
  const wrongPool = (category, truth) => source.filter((q) => q.category === category && q.truth !== truth).map((q) => q.truth);

  const results = source.map((q) => {
    const p = (P_CORRECT[q.category] || { en: 0.9, ur: 0.75 })[q.lang];
    const correct = rand() < p;
    const pool = wrongPool(q.category, q.truth);
    const predicted = correct || !pool.length ? q.truth : pool[Math.floor(rand() * pool.length)];
    const base = q.lang === "en" ? 0.66 : 0.56;
    const rougeL = correct ? base + rand() * 0.22 : 0.08 + rand() * 0.3;
    return {
      queryId: q.id,
      lang: q.lang,
      category: q.category,
      query: q.query,
      truth: q.truth,
      predicted,
      correct,
      rougeL: Number(rougeL.toFixed(3)),
    };
  });

  const jitter = (v, r) => Number(Math.min(0.99, v + (rand() - 0.5) * r).toFixed(3));
  return {
    id: nextRunId++,
    createdAt,
    results,
    summarizer: { rougeL: jitter(0.52, 0.06), coverage: jitter(0.88, 0.06), allergyRecall: jitter(0.97, 0.04) },
  };
}

// One earlier run so the Results tab is not empty on first open.
runs = [buildRun(queries, 11, Date.now() - 86400000)];

export const evaluationService = {
  async listQueries() {
    await wait();
    return [...queries];
  },

  async createQuery(data) {
    await wait();
    const q = { id: Date.now(), ...data };
    queries = [...queries, q];
    return q;
  },

  async updateQuery(id, data) {
    await wait();
    queries = queries.map((q) => (q.id === id ? { ...q, ...data } : q));
    return queries.find((q) => q.id === id);
  },

  async removeQuery(id) {
    await wait();
    queries = queries.filter((q) => q.id !== id);
  },

  /** Newest first. */
  async listRuns() {
    await wait();
    return [...runs].reverse();
  },

  /** Evaluates every query currently in the benchmark. */
  async runEvaluation() {
    await wait(1200);
    const run = buildRun(queries, Math.floor(Math.random() * 100000), Date.now());
    runs = [...runs, run];
    return run;
  },
};

/** Pure helper: totals per language and per category for one run. */
export function summarizeRun(run) {
  const acc = (rows) => (rows.length ? rows.filter((r) => r.correct).length / rows.length : null);
  const rouge = (rows) => (rows.length ? rows.reduce((s, r) => s + r.rougeL, 0) / rows.length : null);
  const by = (lang, category) => run.results.filter((r) => r.lang === lang && (!category || r.category === category));

  const side = (lang, category) => {
    const rows = by(lang, category);
    return { count: rows.length, top1: acc(rows), rougeL: rouge(rows) };
  };
  const gap = (en, ur) => (en.top1 == null || ur.top1 == null ? null : (en.top1 - ur.top1) * 100);

  const overall = { en: side("en"), ur: side("ur") };
  overall.gap = gap(overall.en, overall.ur);

  const categories = CATEGORIES.map((category) => {
    const en = side("en", category);
    const ur = side("ur", category);
    return { category, en, ur, gap: gap(en, ur) };
  });

  return { overall, categories, failures: run.results.filter((r) => !r.correct) };
}
