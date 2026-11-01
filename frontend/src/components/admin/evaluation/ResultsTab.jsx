import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "../../../context/LanguageContext.jsx";
import { summarizeRun } from "../../../services/evaluationService.js";
import { downloadCsv } from "../../../utils/csv.js";
import { gapTone, pct, score, signed } from "../../../utils/format.js";
import Alert from "../../common/Alert.jsx";
import Badge from "../../common/Badge.jsx";
import Button from "../../common/Button.jsx";
import Card from "../../common/Card.jsx";
import DataTable from "../../common/DataTable.jsx";
import Select from "../../common/Select.jsx";
import StatCard from "../../common/StatCard.jsx";

const Ltr = ({ children }) => (
  <span dir="ltr" className="inline-block">
    {children}
  </span>
);

function Meter({ label, value }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-bold">{label}</span>
        <Ltr>{pct(value)}</Ltr>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-brand-700" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

function CategoryBar({ label, value, color }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-ink-muted">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value ?? 0) * 100}%` }} />
      </div>
      <span dir="ltr" className="w-14 shrink-0 text-end text-sm font-bold">
        {pct(value)}
      </span>
    </div>
  );
}

/** Metrics of one evaluation run: Top-1 accuracy, ROUGE-L, the Urdu-English gap, summarizer scores, failures. */
export default function ResultsTab({ runs, running, startRun }) {
  const { t, lang } = useLanguage();
  const [selectedId, setSelectedId] = useState(null);
  const [progress, setProgress] = useState(0);

  // Show the newest run unless the admin picked another one
  useEffect(() => {
    if (runs.length && !runs.some((r) => r.id === selectedId)) setSelectedId(runs[0].id);
  }, [runs, selectedId]);

  // Fake progress bar while the (mock) run is in flight
  useEffect(() => {
    if (!running) {
      setProgress(0);
      return;
    }
    const timer = setInterval(() => setProgress((p) => Math.min(92, p + 8)), 120);
    return () => clearInterval(timer);
  }, [running]);

  const run = runs.find((r) => r.id === selectedId);
  const summary = useMemo(() => (run ? summarizeRun(run) : null), [run]);

  const fmtDate = (ts) => new Date(ts).toLocaleString(lang === "ur" ? "ur-PK" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  const handleRun = async () => {
    const newRun = await startRun();
    setSelectedId(newRun.id);
  };

  const exportCsv = () =>
    downloadCsv(`evaluation_run_${run.id}.csv`, [
      ["query_id", "language", "category", "query", "ground_truth", "system_answer", "correct", "rouge_l"],
      ...run.results.map((r) => [r.queryId, r.lang, r.category, r.query, r.truth, r.predicted, r.correct ? 1 : 0, r.rougeL]),
    ]);

  const categoryColumns = summary && [
    { header: t("admin.evaluation.cols.category"), render: (c) => <span className="font-bold">{t(`admin.evaluation.categories.${c.category}`)}</span> },
    { header: t("admin.evaluation.cols.queries"), render: (c) => <Ltr>{c.en.count} / {c.ur.count}</Ltr> },
    { header: t("admin.evaluation.cols.en"), render: (c) => <Ltr>{pct(c.en.top1)}</Ltr> },
    { header: t("admin.evaluation.cols.ur"), render: (c) => <Ltr>{pct(c.ur.top1)}</Ltr> },
    { header: t("admin.evaluation.cols.gap"), render: (c) => <Badge tone={gapTone(c.gap)}><Ltr>{signed(c.gap)}</Ltr></Badge> },
    { header: t("admin.evaluation.cols.rougeEn"), render: (c) => <Ltr>{score(c.en.rougeL)}</Ltr> },
    { header: t("admin.evaluation.cols.rougeUr"), render: (c) => <Ltr>{score(c.ur.rougeL)}</Ltr> },
  ];

  const failureColumns = [
    { header: t("admin.evaluation.benchmark.cols.language"), render: (r) => t(`admin.evaluation.languages.${r.lang}`) },
    { header: t("admin.evaluation.benchmark.cols.category"), render: (r) => t(`admin.evaluation.categories.${r.category}`) },
    {
      header: t("admin.evaluation.benchmark.cols.query"),
      render: (r) => (
        <p dir={r.lang === "ur" ? "rtl" : "ltr"} className={`max-w-sm ${r.lang === "ur" ? "font-urdu leading-loose" : ""}`}>
          {r.query}
        </p>
      ),
    },
    { header: t("admin.evaluation.failures.truth"), render: (r) => <Ltr>{r.truth}</Ltr> },
    { header: t("admin.evaluation.failures.predicted"), render: (r) => <span dir="ltr" className="inline-block text-red-700">{r.predicted}</span> },
  ];

  return (
    <>
      <div className="mb-4">
        <Alert type="info">{t("admin.evaluation.demoNote")}</Alert>
      </div>

      {/* Run controls */}
      <Card className="mb-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Select
              id="run-select"
              label={t("admin.evaluation.runLabel")}
              value={selectedId ?? ""}
              disabled={!runs.length || running}
              onChange={(e) => setSelectedId(Number(e.target.value))}
            >
              {runs.map((r, i) => (
                <option key={r.id} value={r.id}>
                  #{r.id} · {fmtDate(r.createdAt)}
                  {i === 0 ? " ★" : ""}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="secondary" fullWidth={false} disabled={!run || running} onClick={exportCsv}>
            {t("admin.evaluation.exportResults")}
          </Button>
          <Button fullWidth={false} loading={running} onClick={handleRun}>
            {running ? t("admin.evaluation.running") : t("admin.evaluation.run")}
          </Button>
        </div>
        {running && (
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={progress} aria-valuemax={100} aria-label={t("admin.evaluation.running")}>
            <div className="h-full rounded-full bg-brand-700 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </Card>

      {!summary ? (
        <Card className="p-6 text-ink-muted">{t("admin.evaluation.noRuns")}</Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard value={<Ltr>{pct(summary.overall.en.top1)}</Ltr>} label={t("admin.evaluation.stats.top1En")} />
            <StatCard value={<Ltr>{pct(summary.overall.ur.top1)}</Ltr>} label={t("admin.evaluation.stats.top1Ur")} />
            <StatCard
              value={
                <Ltr>
                  {signed(summary.overall.gap)} <span className="text-lg">{t("admin.evaluation.pts")}</span>
                </Ltr>
              }
              label={t("admin.evaluation.stats.gap")}
            />
            <StatCard
              value={
                <span dir="ltr" className="inline-block whitespace-nowrap text-2xl xl:text-3xl">
                  {score(summary.overall.en.rougeL)} / {score(summary.overall.ur.rougeL)}
                </span>
              }
              label={t("admin.evaluation.stats.rouge")}
            />
          </div>

          {/* Accuracy by category */}
          <Card className="mb-6">
            <div className="p-6 pb-4">
              <h2 className="text-2xl font-black">{t("admin.evaluation.categoryTitle")}</h2>
              <p className="mt-1 text-ink-muted">{t("admin.evaluation.categoryHint")}</p>
              <div className="mt-3 flex gap-5 text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-brand-700" /> {t("admin.evaluation.legendEn")}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-amber-500" /> {t("admin.evaluation.legendUr")}
                </span>
              </div>
            </div>

            <div className="grid gap-x-10 gap-y-5 px-6 pb-6 md:grid-cols-2">
              {summary.categories.map((c) => (
                <div key={c.category} className="space-y-1.5">
                  <p className="font-bold">{t(`admin.evaluation.categories.${c.category}`)}</p>
                  <CategoryBar label={t("admin.evaluation.legendEn")} value={c.en.top1} color="bg-brand-700" />
                  <CategoryBar label={t("admin.evaluation.legendUr")} value={c.ur.top1} color="bg-amber-500" />
                </div>
              ))}
            </div>

            <DataTable columns={categoryColumns} rows={summary.categories} rowKey="category" />
          </Card>

          {/* Summarizer metrics */}
          <Card className="mb-6 p-6">
            <h2 className="text-2xl font-black">{t("admin.evaluation.summarizer.title")}</h2>
            <p className="mb-5 mt-1 text-ink-muted">{t("admin.evaluation.summarizer.hint")}</p>
            <div className="grid gap-5 md:grid-cols-3">
              <Meter label={t("admin.evaluation.summarizer.rouge")} value={run.summarizer.rougeL} />
              <Meter label={t("admin.evaluation.summarizer.coverage")} value={run.summarizer.coverage} />
              <Meter label={t("admin.evaluation.summarizer.allergy")} value={run.summarizer.allergyRecall} />
            </div>
          </Card>

          {/* Failures */}
          <Card>
            <div className="p-6 pb-4">
              <h2 className="text-2xl font-black">{t("admin.evaluation.failures.title")}</h2>
              <p className="mt-1 text-ink-muted">{t("admin.evaluation.failures.hint")}</p>
            </div>
            <DataTable
              columns={failureColumns}
              rows={summary.failures}
              rowKey="queryId"
              emptyText={t("admin.evaluation.failures.empty")}
            />
          </Card>
        </>
      )}
    </>
  );
}
