import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useLanguage } from "../../../context/LanguageContext.jsx";
import { summarizeRun } from "../../../services/evaluationService.js";
import { downloadCsv } from "../../../utils/csv.js";
import { gapTone, pct, score, signed } from "../../../utils/format.js";
import Alert from "../../common/Alert.jsx";
import Badge from "../../common/Badge.jsx";
import Button from "../../common/Button.jsx";
import Card from "../../common/Card.jsx";
import ConfirmDialog from "../../common/ConfirmDialog.jsx";
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

function ModelResponsePreview({ result, t }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 12, left: 12, width: 440 });
  const closeTimer = useRef(null);
  const show = (event) => {
    window.clearTimeout(closeTimer.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(440, window.innerWidth - 24);
    const maxHeight = Math.min(520, window.innerHeight * 0.72);
    const below = rect.bottom + maxHeight + 12 < window.innerHeight;
    setPosition({ top: below ? rect.bottom + 8 : Math.max(12, rect.top - maxHeight - 8), left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width });
    setOpen(true);
  };
  const closeLater = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };
  const candidates = Array.isArray(result.confidenceCandidates) ? result.confidenceCandidates : [];
  const response = result.modelResponse || result.predicted || "—";

  return <>
    <button type="button" className="max-w-sm cursor-help text-start underline decoration-dotted underline-offset-4 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700" aria-label={t("admin.evaluation.responsePreview.open")} onMouseEnter={show} onMouseLeave={closeLater} onFocus={show} onBlur={closeLater} onClick={(event) => open ? setOpen(false) : show(event)}>
      <span dir="auto" className="line-clamp-2">{result.predicted || response}</span>
    </button>
    {open && createPortal(
      <section role="dialog" aria-label={t("admin.evaluation.responsePreview.title")} className="fixed z-[100] overflow-hidden rounded-xl border border-line bg-white text-start shadow-2xl" style={{ top: position.top, left: position.left, width: position.width, maxHeight: "72vh" }} onMouseEnter={() => window.clearTimeout(closeTimer.current)} onMouseLeave={closeLater}>
        <div className="max-h-[72vh] overflow-y-auto p-4">
          <h3 className="font-black">{t("admin.evaluation.responsePreview.title")}</h3>
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-ink-muted">{t("admin.evaluation.report.query")}</p>
          <p dir={result.lang === "ur" ? "rtl" : "ltr"} className={`mt-1 whitespace-pre-wrap break-words ${result.lang === "ur" ? "font-urdu leading-loose" : ""}`}>{result.query}</p>
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-ink-muted">{t("admin.evaluation.responsePreview.confidenceNote")}</p>
          {candidates.length ? <div className="mt-2 space-y-2">{candidates.map((candidate, index) => {
            const confidence = Math.max(0, Math.min(100, Number(candidate.confidence) || 0));
            return <div key={`${candidate.label}-${index}`}>
              <div className="mb-1 flex items-start justify-between gap-3 text-sm"><span dir="auto" className="min-w-0 break-words font-bold">{candidate.label}</span><span dir="ltr" className="shrink-0">{confidence.toFixed(1)}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-brand-700" style={{ width: `${confidence}%` }} /></div>
            </div>;
          })}</div> : result.confidence != null ? <p className="mt-1 font-bold"><span dir="auto">{result.predicted}</span> · <span dir="ltr">{Number(result.confidence).toFixed(1)}%</span></p> : <p className="mt-1 text-sm text-ink-muted">{t("admin.evaluation.responsePreview.noConfidence")}</p>}
          {result.explanation && <><p className="mt-3 text-xs font-bold uppercase tracking-wide text-ink-muted">{t("admin.evaluation.responsePreview.explanation")}</p><p dir="auto" className="mt-1 whitespace-pre-wrap break-words">{result.explanation}</p></>}
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-ink-muted">{t("admin.evaluation.responsePreview.fullResponse")}</p>
          <pre dir="auto" className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-3 text-xs">{response}</pre>
        </div>
      </section>, document.body,
    )}
  </>;
}

/** Metrics of one evaluation run: Top-1 accuracy, ROUGE-L, the Urdu-English gap, summarizer scores, failures. */
export default function ResultsTab({ runs, models, loading, running, startRun, resumeRun, cancelRun, deleteRun }) {
  const { t, lang } = useLanguage();
  const [selectedId, setSelectedId] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [provider, setProvider] = useState(models.groq?.length ? "groq" : "ollama");
  const [model, setModel] = useState("");
  const [exportFormat, setExportFormat] = useState("csv");
  const [runError, setRunError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const availableModels = models[provider] || [];

  useEffect(() => {
    if (!models[provider]?.length) {
      const nextProvider = ["groq", "ollama"].find((key) => models[key]?.length);
      if (nextProvider) setProvider(nextProvider);
    }
  }, [models, provider]);

  useEffect(() => {
    if (!availableModels.includes(model)) setModel(availableModels[0] || "");
  }, [availableModels, model]);

  // Show the newest run unless the admin picked another one
  useEffect(() => {
    if (runs.length && !runs.some((r) => r.id === selectedId)) setSelectedId(runs[0].id);
  }, [runs, selectedId]);

  // Refresh elapsed and per-query clocks while the server processes the selected model.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const run = runs.find((r) => r.id === selectedId);
  const summary = useMemo(() => (run ? summarizeRun(run) : null), [run]);

  const fmtDate = (ts) => new Date(ts).toLocaleString(lang === "ur" ? "ur-PK" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const duration = (milliseconds) => {
    if (milliseconds == null || !Number.isFinite(milliseconds)) return "—";
    if (milliseconds < 10000) return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return hours ? `${hours}h ${minutes}m ${rest}s` : minutes ? `${minutes}m ${rest}s` : `${rest}s`;
  };
  const currentQueryMs = run?.currentQueryStartedAt ? clockNow - new Date(run.currentQueryStartedAt).getTime() : null;
  const elapsedMs = run?.status === "completed" || run?.status === "failed" || run?.status === "cancelled"
    ? run.durationMs
    : (run?.durationMs || 0) + (currentQueryMs || 0);
  const averageQueryMs = run?.completedQueries ? run.durationMs / run.completedQueries : null;
  const estimatedQueryMs = averageQueryMs ?? currentQueryMs;
  const remainingMs = estimatedQueryMs == null ? null : estimatedQueryMs * Math.max(0, run.totalQueries - run.completedQueries);

  const handleRun = async () => {
    setRunError("");
    try {
      const newRun = await startRun({ provider, model }, setSelectedId);
      setSelectedId(newRun.id);
    } catch (error) {
      setRunError(error.response?.data?.detail || error.message || t("admin.evaluation.runFailed"));
    }
  };

  const handleResume = async () => {
    if (!run) return;
    setRunError("");
    try {
      const resumed = await resumeRun(run.id, setSelectedId);
      setSelectedId(resumed.id);
    } catch (error) {
      setRunError(error.response?.data?.detail || error.message || t("admin.evaluation.runFailed"));
    }
  };

  const handleCancel = async () => {
    if (!run) return;
    setRunError("");
    try {
      await cancelRun(run.id);
    } catch (error) {
      setRunError(error.response?.data?.detail || error.message || t("admin.evaluation.cancelFailed"));
    }
  };

  const handleDelete = async () => {
    if (!run) return;
    const deletedId = run.id;
    await deleteRun(deletedId);
    const remainingRuns = runs.filter((item) => item.id !== deletedId);
    setSelectedId(remainingRuns[0]?.id ?? null);
    setDeleteDialogOpen(false);
  };

  const exportCsv = () =>
    downloadCsv(`evaluation_run_${run.id}.csv`, [
      ["provider", "model", "run_duration_ms", "query_id", "language", "category", "query", "ground_truth", "predicted_label", "model_response", "confidence_candidates", "query_duration_ms", "rouge_l"],
      ...run.results.map((r) => [run.provider, run.model, run.durationMs, r.queryId, r.lang, r.category, r.query, r.truth, r.predicted, r.modelResponse || r.predicted, JSON.stringify(r.confidenceCandidates || []), r.durationMs, r.rougeL]),
    ]);

  const exportPdf = async () => {
    if (!run || !summary) return;
    // Keep the same average response-time calculation used by the existing PDF export.
    const totalQueryMs = run.results.reduce((sum, row) => sum + (row.durationMs || 0), 0);
    const averageQueryTime = run.results.length ? duration(totalQueryMs / run.results.length) : "—";
    // Open synchronously so the browser does not block this window as a popup.
    const report = window.open("", "_blank");
    if (!report) return;
    report.document.open();
    report.document.write("<!doctype html><html lang=\"en\" dir=\"ltr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Research evaluation</title></head><body style=\"margin:0\"><p style=\"font:14px Arial,sans-serif;padding:24px\">Preparing the evaluation report…</p></body></html>");
    report.document.close();

    try {
      const [ReportModule, styleModule] = await Promise.all([
        import("./EvaluationPrintReport.jsx"),
        import("./evaluation-print.css?inline"),
      ]);
      const markup = ReportModule.renderEvaluationPrintReport({
        run, summary, duration, pct, signed, score, averageQueryTime,
      });
      const googleFonts = `
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;600&display=swap" rel="stylesheet">`;
      report.document.open();
      report.document.write(`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Research evaluation #${run.id}</title>${googleFonts}<style>${styleModule.default}</style></head><body style="margin:0">${markup}</body></html>`);
      report.document.close();

      const fontSet = report.document.fonts;
      const fontLoads = fontSet ? Promise.all([
        fontSet.load('400 12px Inter'),
        fontSet.load('400 15px "Noto Naskh Arabic"'),
      ]) : Promise.resolve();
      const fontsReady = fontSet ? Promise.all([fontSet.ready, fontLoads]) : fontLoads;
      await Promise.race([fontsReady, new Promise((resolve) => report.setTimeout(resolve, 2500))]);
      await new Promise((resolve) => report.setTimeout(resolve, 120));
      report.focus();
      report.print();
    } catch (error) {
      report.close();
      console.error("Could not prepare the evaluation PDF report", error);
    }
  };

  const exportReport = () => exportFormat === "pdf" ? exportPdf() : exportCsv();

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

  const resultColumns = [
    { header: t("admin.evaluation.report.language"), render: (r) => t(`admin.evaluation.languages.${r.lang}`) },
    { header: t("admin.evaluation.cols.category"), render: (r) => t(`admin.evaluation.categories.${r.category}`) },
    { header: t("admin.evaluation.report.query"), render: (r) => <p dir={r.lang === "ur" ? "rtl" : "ltr"} className={`max-w-md whitespace-pre-wrap ${r.lang === "ur" ? "font-urdu leading-loose" : ""}`}>{r.query}</p> },
    { header: t("admin.evaluation.report.truth"), render: (r) => <span dir="auto">{r.truth}</span> },
    { header: t("admin.evaluation.report.response"), render: (r) => <ModelResponsePreview result={r} t={t} /> },
    { header: t("admin.evaluation.report.queryTime"), render: (r) => <Ltr>{duration(r.durationMs)}</Ltr> },
  ];

  return (
    <>
      <div className="mb-4">
        <Alert type="info">{t("admin.evaluation.demoNote")}</Alert>
      </div>
      {runError && <div className="mb-4"><Alert>{runError}</Alert></div>}
      {run?.status === "failed" && run.error && !runError && <div className="mb-4"><Alert>{run.error}</Alert></div>}

      {/* Run controls */}
      <Card className="mb-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Select
              id="run-select"
              label={t("admin.evaluation.runLabel")}
              value={selectedId ?? ""}
              disabled={!runs.length || running || loading}
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
          <div className="w-36">
            <Select id="evaluation-export-format" label={t("admin.evaluation.exportFormat")} value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
              <option value="csv">CSV</option><option value="pdf">PDF</option>
            </Select>
          </div>
          <Button variant="secondary" fullWidth={false} disabled={!run || running} onClick={exportReport}>
            {t("admin.evaluation.exportResults")}
          </Button>
          {run && !["queued", "running"].includes(run.status) && (
            <Button variant="dangerOutline" fullWidth={false} disabled={running || loading} onClick={() => setDeleteDialogOpen(true)}>
              {t("admin.evaluation.deleteReport")}
            </Button>
          )}
          <div className="w-40">
            <Select id="evaluation-provider" label={t("admin.evaluation.modelProvider")} value={provider} onChange={(e) => { setProvider(e.target.value); setModel(""); }} disabled={running || loading}>
              {["groq", "ollama"].filter((key) => models[key]?.length).map((key) => <option key={key} value={key}>{key === "groq" ? "GroqCloud" : "Ollama"}</option>)}
            </Select>
          </div>
          <div className="min-w-[14rem] flex-1">
            <Select id="evaluation-model" label={t("admin.evaluation.modelLabel")} value={model} onChange={(e) => setModel(e.target.value)} disabled={running || loading || !availableModels.length}>
              {availableModels.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </div>
          <Button fullWidth={false} loading={running} disabled={!model || running || loading} onClick={handleRun}>
            {running ? t("admin.evaluation.running") : t("admin.evaluation.run")}
          </Button>
          {run && ["queued", "running"].includes(run.status) && (
            <Button variant="dangerOutline" fullWidth={false} disabled={loading} onClick={handleCancel}>
              {t("admin.evaluation.cancelRun")}
            </Button>
          )}
          {run && ["cancelled", "failed"].includes(run.status) && (
            <Button variant="secondary" fullWidth={false} disabled={running || loading} onClick={handleResume}>
              {t("admin.evaluation.resumeRun")}
            </Button>
          )}
        </div>
        {running && (
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={run?.totalQueries ? Math.round((run.completedQueries / run.totalQueries) * 100) : 0} aria-valuemax={100} aria-label={t("admin.evaluation.running")}>
            <div className="h-full rounded-full bg-brand-700 transition-all" style={{ width: `${run?.totalQueries ? Math.min(100, (run.completedQueries / run.totalQueries) * 100) : 0}%` }} />
          </div>
        )}
      </Card>

      {run && ["queued", "running"].includes(run.status) && (
        <Card className="mb-6 p-6">
          <h2 className="text-xl font-black">{t("admin.evaluation.progress.title")}</h2>
          <p className="mt-2 text-ink-muted"><Ltr>{run.completedQueries} / {run.totalQueries}</Ltr> {t("admin.evaluation.progress.completed")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <p><strong>{t("admin.evaluation.progress.elapsed")}:</strong> <Ltr>{duration(elapsedMs)}</Ltr></p>
            <p><strong>{t("admin.evaluation.progress.estimated")}:</strong> <Ltr>{remainingMs == null ? "—" : duration(remainingMs)}</Ltr></p>
            <p><strong>{t("admin.evaluation.progress.currentTime")}:</strong> <Ltr>{currentQueryMs == null ? "—" : duration(currentQueryMs)}</Ltr></p>
          </div>
          {run.currentQuery && <p className="mt-3 break-words"><strong>{t("admin.evaluation.progress.currentQuery")}:</strong> <span dir="auto">{run.currentQuery}</span></p>}
        </Card>
      )}

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

          {run.results.length > 0 && (
            <Card className="mb-6">
              <div className="p-6 pb-3"><h2 className="text-xl font-black">{t("admin.evaluation.report.title")}</h2><p className="mt-1 text-ink-muted">{t("admin.evaluation.report.totalTime")}: <Ltr>{duration(run.durationMs)}</Ltr></p></div>
              <DataTable columns={resultColumns} rows={run.results} rowKey="queryId" />
            </Card>
          )}

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

      {/* Keep the existing Clinical summarizer section visible before and after evaluation runs. */}
      <Card className="mb-6 p-6">
        <h2 className="text-2xl font-black">{t("admin.evaluation.summarizer.title")}</h2>
        <p className="mb-5 mt-1 text-ink-muted">{t("admin.evaluation.summarizer.hint")}</p>
        <div className="grid gap-5 md:grid-cols-3">
          <Meter label={t("admin.evaluation.summarizer.rouge")} value={run?.summarizer?.rougeL ?? null} />
          <Meter label={t("admin.evaluation.summarizer.coverage")} value={run?.summarizer?.coverage ?? null} />
          <Meter label={t("admin.evaluation.summarizer.allergy")} value={run?.summarizer?.allergyRecall ?? null} />
        </div>
      </Card>
      <ConfirmDialog
        open={deleteDialogOpen}
        title={t("admin.evaluation.deleteReportTitle")}
        itemName={run ? `#${run.id} · ${run.provider} / ${run.model}` : ""}
        message={t("admin.evaluation.deleteReportMessage")}
        confirmLabel={t("admin.evaluation.deleteReport")}
        onConfirm={handleDelete}
        onClose={() => setDeleteDialogOpen(false)}
      />
    </>
  );
}
