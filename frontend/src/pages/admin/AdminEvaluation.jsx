import { useState } from "react";

import BenchmarkTab from "../../components/admin/evaluation/BenchmarkTab.jsx";
import ResultsTab from "../../components/admin/evaluation/ResultsTab.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import Tabs from "../../components/common/Tabs.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import useEvaluation from "../../hooks/useEvaluation.js";

/**
 * Admin > Research evaluation (Phase 4 of the proposal): the 400-query EN/UR benchmark and the metrics
 * (Top-1 accuracy, ROUGE-L, Urdu-English accuracy gap by category, summarizer scores).
 */
export default function AdminEvaluation() {
  const { t } = useLanguage();
  const [tab, setTab] = useState("results");
  const evaluation = useEvaluation();

  const tabs = [
    { id: "results", label: t("admin.evaluation.tabs.results") },
    { id: "benchmark", label: t("admin.evaluation.tabs.benchmark") },
  ];

  return (
    <>
      <PageHeader title={t("admin.nav.evaluation")} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "results" ? (
        <ResultsTab runs={evaluation.runs} running={evaluation.running} startRun={evaluation.startRun} />
      ) : (
        <BenchmarkTab
          queries={evaluation.queries}
          loading={evaluation.loading}
          addQuery={evaluation.addQuery}
          updateQuery={evaluation.updateQuery}
          removeQuery={evaluation.removeQuery}
        />
      )}
    </>
  );
}
