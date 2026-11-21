import { useCallback, useEffect, useState } from "react";
import { evaluationService } from "../services/evaluationService.js";

/** Benchmark queries + evaluation runs, with helpers to edit the dataset and start a new run. */
export default function useEvaluation() {
  const [queries, setQueries] = useState([]);
  const [runs, setRuns] = useState([]);
  const [models, setModels] = useState({ groq: [], ollama: [] });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const upsertRun = (next) => setRuns((current) => [next, ...current.filter((item) => item.id !== next.id)].sort((a, b) => b.id - a.id));

  const reloadQueries = useCallback(async () => {
    setQueries(await evaluationService.listQueries());
  }, []);
  const reloadRuns = useCallback(async () => setRuns(await evaluationService.listRuns()), []);
  const reloadModels = useCallback(async () => setModels(await evaluationService.listModels()), []);

  useEffect(() => {
    let stopped = false;
    const initialize = async () => {
      try {
        const [initialQueries, initialRuns, initialModels] = await Promise.all([
          evaluationService.listQueries(), evaluationService.listRuns(), evaluationService.listModels(),
        ]);
        if (stopped) return;
        setQueries(initialQueries);
        setRuns(initialRuns);
        setModels(initialModels);
        setLoading(false);
        let active = initialRuns.find((item) => ["queued", "running"].includes(item.status));
        if (!active) return;
        setRunning(true);
        while (!stopped && active && ["queued", "running"].includes(active.status)) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          active = await evaluationService.getRun(active.id);
          if (!stopped) upsertRun(active);
        }
      } catch {
        if (!stopped) setLoading(false);
      } finally {
        if (!stopped) setRunning(false);
      }
    };
    initialize();
    return () => { stopped = true; };
  }, []);

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

  const monitorRun = async (initial, onStarted) => {
    let active = initial;
    upsertRun(active);
    onStarted?.(active.id);
    while (["queued", "running"].includes(active.status)) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      active = await evaluationService.getRun(active.id);
      upsertRun(active);
    }
    if (active.status === "failed") throw new Error(active.error || "Evaluation failed.");
    await reloadRuns();
    return active;
  };

  const startRun = async (selection, onStarted) => {
    setRunning(true);
    try {
      return await monitorRun(await evaluationService.runEvaluation(selection), onStarted);
    } finally {
      setRunning(false);
    }
  };

  const resumeRun = async (id, onStarted) => {
    setRunning(true);
    try {
      return await monitorRun(await evaluationService.resumeRun(id), onStarted);
    } finally {
      setRunning(false);
    }
  };

  const cancelRun = async (id) => {
    const run = await evaluationService.cancelRun(id);
    upsertRun(run);
    return run;
  };

  const deleteRun = async (id) => {
    try {
      await evaluationService.deleteRun(id);
      setRuns((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      throw new Error(error.response?.data?.detail || error.message || "Could not delete evaluation report.");
    }
  };

  return { queries, runs, models, loading, running, addQuery, updateQuery, removeQuery, startRun, resumeRun, cancelRun, deleteRun };
}
