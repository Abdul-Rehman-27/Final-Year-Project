import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const CATEGORY_NAMES = {
  triage: "Symptom triage",
  diseaseDetection: "Disease detection",
  doctorInfo: "Doctor information",
  appointment: "Appointments",
  hospitalInfo: "Hospital information",
};

const hasArabicScript = (value) => /\p{Script=Arabic}/u.test(value || "");
const languageMismatch = (result) => {
  const containsArabic = hasArabicScript(result.query);
  return (result.lang === "en" && containsArabic) || (result.lang === "ur" && !containsArabic);
};

const normalizeLabel = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
const labelForDisplay = (value) => String(value || "").replace(/([\p{Script=Arabic}])\(/gu, "$1 (");

function formatGeneratedDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Karachi", timeZoneName: "short",
  }).format(value);
}

function LanguageChip({ lang, long = false }) {
  const urdu = lang === "ur";
  return <span className={`language-chip ${urdu ? "urdu-chip" : "english-chip"}`}>{long ? (urdu ? "Urdu" : "English") : (urdu ? "UR" : "EN")}</span>;
}

function Header({ eyebrow, title, right, compact = false }) {
  return (
    <header className={`report-header ${compact ? "compact-header" : ""}`}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <div className="title-row"><h1>{title}</h1>{right?.pill && <span className="run-pill">{right.pill}</span>}</div>
      </div>
      {right?.content && <div className="header-right">{right.content}</div>}
    </header>
  );
}

function PageFooter({ left, page, total }) {
  return <footer className="page-footer"><span>{left}</span><span>Page {page} of {total}</span></footer>;
}

function Kpi({ label, value, caption, tone = "neutral", large = false }) {
  return <section className={`kpi-card kpi-${tone}`}>
    <i className="kpi-top-bar" aria-hidden="true" />
    <h2>{label}</h2><p className={large ? "kpi-value kpi-value-large" : "kpi-value"}>{value}</p><p className="kpi-caption">{caption}</p>
  </section>;
}

function AccuracyLine({ lang, value, count }) {
  const missing = value == null || count === 0;
  return <div className="accuracy-line">
    <LanguageChip lang={lang} />
    <div className={`accuracy-track ${missing ? "empty-track" : ""}`}>
      {!missing && <span className={`accuracy-fill ${lang === "ur" ? "fill-urdu" : "fill-english"}`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />}
    </div>
    <strong className="accuracy-value">{missing ? "n/a" : `${(value * 100).toFixed(1)}%`}</strong>
  </div>;
}

function SummaryPage({ run, summary, duration, pct, signed, score, averageQueryTime, generatedAt, totalPages }) {
  const languageCounts = run.results.reduce((counts, result) => {
    counts[result.lang === "ur" ? "ur" : "en"] += 1;
    return counts;
  }, { en: 0, ur: 0 });
  const totalCount = run.results.length;
  const reviewFlags = [];

  const populatedCategories = summary.categories.filter((category) => category.en.count + category.ur.count > 0);
  if (populatedCategories.length > 0 && populatedCategories.every((category) => {
    const count = category.en.count + category.ur.count;
    return count <= 2;
  })) {
    reviewFlags.push("Each category has 2 or fewer queries, so scores come from a very small sample.");
  }
  run.results.forEach((result, index) => {
    if (languageMismatch(result)) {
      const language = result.lang === "ur" ? "Urdu" : "English";
      reviewFlags.push(`Query #${index + 1} is tagged ${language} but its text is in a different script.`);
    }
    if (result.correct) return;
    const candidates = Array.isArray(result.confidenceCandidates) ? result.confidenceCandidates : [];
    const truthRank = candidates.findIndex((candidate) => normalizeLabel(candidate.label) === normalizeLabel(result.truth));
    if (truthRank >= 0) {
      const candidateConfidence = candidates[truthRank].confidence;
      const confidence = Number(candidateConfidence);
      const confidenceText = candidateConfidence != null && candidateConfidence !== "" && Number.isFinite(confidence) ? `${confidence}%` : "n/a";
      reviewFlags.push(`Query #${index + 1} was marked incorrect, but the ground truth was ranked #${truthRank + 1} (${confidenceText}).`);
    }
  });
  const visibleReviewFlags = reviewFlags.slice(0, 4);

  return <section className="page summary-page">
    <Header
      eyebrow="HOSPITAL MANAGEMENT SYSTEM · ADMIN"
      title="Research evaluation"
      right={{
        pill: `Run #${run.id}`,
        content: <><strong>{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Karachi" }).format(new Date(run.createdAt))}</strong><span>{new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi", timeZoneName: "short" }).format(new Date(run.createdAt))}</span></>,
      }}
    />

    <section className="run-strip" aria-label="Evaluation run details">
      {[
        ["PROVIDER", run.provider], ["MODEL", run.model], ["TOTAL RUN TIME", duration(run.durationMs)],
        ["AVG QUERY TIME", averageQueryTime], ["QUERIES", `${totalCount} (${languageCounts.en} EN · ${languageCounts.ur} UR)`],
      ].map(([label, value]) => <div className="run-cell" key={label}><span className="label">{label}</span><strong>{value}</strong></div>)}
    </section>

    <section className="kpi-grid" aria-label="Summary metrics">
      <Kpi label="Top-1 accuracy · English" value={pct(summary.overall.en.top1)} caption={`${summary.overall.en.count} queries`} tone="english" large />
      <Kpi label="Top-1 accuracy · Urdu" value={pct(summary.overall.ur.top1)} caption={`${summary.overall.ur.count} queries`} tone="urdu" large />
      <Kpi label="Urdu-English gap" value={<>{signed(summary.overall.gap)} <small>pts</small></>} caption="Lower is better" tone="neutral" />
      <Kpi label="ROUGE-L (EN / UR)" value={`${score(summary.overall.en.rougeL)} / ${score(summary.overall.ur.rougeL)}`} caption="Scale 0 to 1" tone="neutral" />
    </section>

    <section className="summary-section accuracy-section">
      <div className="section-heading"><h2>ACCURACY BY CATEGORY</h2><div className="legend"><span><i className="legend-square english-square" />English</span><span><i className="legend-square urdu-square" />Urdu</span></div></div>
      <div className="accuracy-box">
        {summary.categories.map((category) => <div className="accuracy-row" key={category.category}>
          <h3>{CATEGORY_NAMES[category.category] || category.category}</h3>
          <div className="accuracy-lines">
            <AccuracyLine lang="en" value={category.en.top1} count={category.en.count} />
            <AccuracyLine lang="ur" value={category.ur.top1} count={category.ur.count} />
          </div>
        </div>)}
      </div>
    </section>

    <section className="summary-section breakdown-section">
      <h2 className="section-title">CATEGORY BREAKDOWN</h2>
      <table className="breakdown-table">
        <thead><tr><th>CATEGORY</th><th>QUERIES EN / UR</th><th>TOP-1 EN</th><th>TOP-1 UR</th><th>GAP</th><th>ROUGE-L EN</th><th>ROUGE-L UR</th></tr></thead>
        <tbody>{summary.categories.map((category) => <tr key={category.category}>
          <th scope="row">{CATEGORY_NAMES[category.category] || category.category}</th>
          <td>{category.en.count} / {category.ur.count}</td>
          <td>{category.en.count ? pct(category.en.top1) : "n/a"}</td>
          <td>{category.ur.count ? pct(category.ur.top1) : "n/a"}</td>
          <td>{category.gap == null ? "n/a" : signed(category.gap)}</td>
          <td>{category.en.count ? score(category.en.rougeL) : "n/a"}</td>
          <td>{category.ur.count ? score(category.ur.rougeL) : "n/a"}</td>
        </tr>)}</tbody>
      </table>
    </section>

    <section className="summary-bottom">
      {visibleReviewFlags.length > 0 && <aside className="review-flags"><h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 1.8 20.5h20.4L12 3Zm0 5.2v5.7m0 3.2v.1" /></svg>REVIEW FLAGS</h2>
        <ul>{visibleReviewFlags.map((flag, index) => <li key={index}>{flag}</li>)}</ul>
      </aside>}
      <section className={`evaluator-remarks ${visibleReviewFlags.length ? "" : "remarks-full"}`}>
        <h2 className="label">EVALUATOR REMARKS</h2>
        <div className="writing-lines"><i /><i /><i /><i /></div>
        <div className="signature-row"><span><i />Evaluated by</span><span><i />Date</span></div>
      </section>
    </section>

    <PageFooter left={`Research evaluation · Run #${run.id} · Generated ${formatGeneratedDate(generatedAt)}`} page={1} total={totalPages} />
  </section>;
}

function PredictionList({ result }) {
  let candidates = Array.isArray(result.confidenceCandidates) ? result.confidenceCandidates : [];
  if (!candidates.length && result.predicted) {
    candidates = [{ label: result.predicted, confidence: result.confidence }];
  }
  if (!candidates.length && result.modelResponse) {
    candidates = [{ label: result.modelResponse, confidence: null }];
  }

  return <ol className="prediction-list">{candidates.map((candidate, index) => {
    const confidence = Number(candidate.confidence);
    const hasConfidence = candidate.confidence != null && candidate.confidence !== "" && Number.isFinite(confidence);
    const label = labelForDisplay(candidate.label);
    const urdu = hasArabicScript(label);
    return <li className="prediction-item" key={`${candidate.label}-${index}`}>
      <div className="prediction-line">
        <span className="prediction-rank" dir="ltr">{index + 1}.</span>
        <span dir={urdu ? "rtl" : "ltr"} className={`prediction-label ${urdu ? "urdu-text" : ""} ${index === 0 ? "prediction-top" : ""}`}>{label}</span>
        <strong className="prediction-confidence" dir="ltr">{hasConfidence ? `${confidence.toFixed(Number.isInteger(confidence) ? 0 : 1)}%` : "n/a"}</strong>
      </div>
      <div className="confidence-track">{hasConfidence && <span className={index === 0 ? "confidence-primary" : "confidence-secondary"} style={{ width: `${Math.max(0, Math.min(100, confidence))}%` }} />}</div>
    </li>;
  })}</ol>;
}

function QueryCard({ result, index, duration }) {
  const urdu = result.lang === "ur";
  const mismatch = languageMismatch(result);
  const correct = Boolean(result.correct);
  const candidates = result.confidenceCandidates || [];
  const topCandidate = candidates[0]?.label || result.predicted;
  return <article className="query-card">
    <header className="query-card-header">
      <span className="query-number">#{index + 1}</span>
      <LanguageChip lang={result.lang} long />
      <span className="category-chip">{CATEGORY_NAMES[result.category] || result.category}</span>
      {mismatch && <span className="mismatch-chip"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6 1.6 13h12.8L8 1.6Zm0 3.2v4m0 2.1v.1" /></svg>Language mismatch</span>}
      <span className="query-header-spacer" />
      <span className="response-time">Response time <strong>{duration(result.durationMs)}</strong></span>
      <span className={`status-pill ${correct ? "status-correct" : "status-incorrect"}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">{correct ? <path d="m3 8 3.2 3.2L13 4.5" /> : <path d="m4 4 8 8m0-8-8 8" />}</svg>{correct ? "Correct" : "Incorrect"}
      </span>
    </header>
    <div className="query-card-body">
      <section className="query-column">
        <h3 className="label">QUERY</h3>
        <p dir={urdu ? "rtl" : "ltr"} className={`query-text ${urdu ? "urdu-text" : ""}`}>{result.query}</p>
        <h3 className="label truth-label">GROUND TRUTH</h3>
        <p dir={hasArabicScript(result.truth) ? "rtl" : "ltr"} className={`ground-truth ${hasArabicScript(result.truth) ? "urdu-text" : ""}`}>{result.truth}</p>
      </section>
      <section className="prediction-column">
        <h3 className="label">PREDICTED LABELS AND CONFIDENCE</h3>
        <PredictionList result={result} />
        {result.explanation && <><h3 className="label explanation-label">MODEL EXPLANATION</h3><p dir="auto" className={`explanation-text ${hasArabicScript(result.explanation) ? "urdu-text" : ""}`}>{result.explanation}</p></>}
        {!result.explanation && topCandidate && <p className="answer-note">Model response: <span dir="auto">{result.modelResponse || result.predicted}</span></p>}
      </section>
    </div>
    <section className="remarks-area"><h3 className="label">REMARKS</h3><div><i /><i /></div></section>
  </article>;
}

function DetailPage({ run, results, firstIndex, page, totalPages, duration }) {
  const start = firstIndex + 1;
  const end = firstIndex + results.length;
  const rangeLabel = results.length === 1 ? `Query ${start} of ${run.results.length}` : `Queries ${start}-${end} of ${run.results.length}`;
  const slots = results.map((result, offset) => <QueryCard key={`${result.queryId}-${offset}`} result={result} index={firstIndex + offset} duration={duration} />);
  return <section className="page detail-page">
    <Header eyebrow={`RESEARCH EVALUATION · RUN #${run.id}`} title="Detailed query report" compact
      right={{ content: <div className="detail-legend"><span><i className="legend-confidence" />Model confidence</span><span><i className="legend-correct">✓</i>Top-1 matches ground truth</span></div> }} />
    <main className="detail-card-stack">{slots}</main>
    <PageFooter left={`Research evaluation · Run #${run.id} · ${rangeLabel}`} page={page} total={totalPages} />
  </section>;
}

export default function EvaluationPrintReport({ run, summary, duration, pct, signed, score, averageQueryTime }) {
  const generatedAt = new Date();
  const detailPageCount = Math.ceil(run.results.length / 3);
  const totalPages = 1 + detailPageCount;
  const detailPages = Array.from({ length: detailPageCount }, (_, pageIndex) => {
    const firstIndex = pageIndex * 3;
    return <DetailPage key={pageIndex} run={run} results={run.results.slice(firstIndex, firstIndex + 3)} firstIndex={firstIndex} page={pageIndex + 2} totalPages={totalPages} duration={duration} />;
  });
  return <main className="eval-print-root">
    <SummaryPage run={run} summary={summary} duration={duration} pct={pct} signed={signed} score={score} averageQueryTime={averageQueryTime} generatedAt={generatedAt} totalPages={totalPages} />
    {detailPages}
  </main>;
}

export function renderEvaluationPrintReport(props) {
  return renderToStaticMarkup(React.createElement(EvaluationPrintReport, props));
}
