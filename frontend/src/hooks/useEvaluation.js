import { useCallback, useEffect, useState } from "react";
import { evaluationService } from "../services/evaluationService.js";

/** Benchmark queries + evaluation runs, with helpers to edit the dataset and start a new run. */
export default function useEvaluation() {
  const [queries, setQueries] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const reloadQueries = useCallback(async () => setQueries(await evaluationService.listQueries()), []);
  const reloadRuns = useCallback(async () => setRuns(await evaluationService.listRuns()), []);

  useEffect(() => {
    Promise.all([reloadQueries(), reloadRuns()]).then(() => setLoading(false));
  }, [reloadQueries, reloadRuns]);

  const addQuery = async (data) => {
    await evaluationService.createQuery(data);
    await reloadQueries();
  };
  const updateQuery = async (id, data) => {
    await evaluationService.updateQuery(id, data);
    await reloadQueries();
  };
  const removeQuery = async (id) => {
    await evaluationService.removeQuery(id);
    await reloadQueries();
  };

  /** Starts a run; resolves with the new run (it is the newest in `runs`). */
  const startRun = async () => {
    setRunning(true);
    try {
      const run = await evaluationService.runEvaluation();
      await reloadRuns();
      return run;
    } finally {
      setRunning(false);
    }
  };

  return { queries, runs, loading, running, addQuery, updateQuery, removeQuery, startRun };
}
