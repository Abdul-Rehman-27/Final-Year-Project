import { memo, useCallback, useEffect, useMemo, useState } from "react";

import Alert from "../../components/common/Alert.jsx";
import Badge from "../../components/common/Badge.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import Input from "../../components/common/Input.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import Select from "../../components/common/Select.jsx";
import Toggle from "../../components/common/Toggle.jsx";
import useAdminSocket from "../../hooks/useAdminSocket.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { chatbotAdminService } from "../../services/chatbotAdminService.js";

// Format optional counts consistently in both interface languages.
function numberFormat(value, number) {
  return value == null ? "—" : number.format(value);
}

// Show whether a provider is reachable.
const StatusBadge = memo(function StatusBadge({ status, t }) {
  const online = status === "online";
  return <Badge tone={online ? "success" : "danger"}>{t(online ? "admin.knowledgeBase.online" : "admin.knowledgeBase.offline")}</Badge>;
});

// Display one of the page's high-level usage measures.
const MetricCard = memo(function MetricCard({ label, value, detail }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-bold text-ink-muted">{label}</p>
      <p dir="ltr" className="mt-2 text-3xl font-black tracking-tight text-brand-700">{value}</p>
      {detail && <p className="mt-1 text-sm text-ink-muted">{detail}</p>}
    </Card>
  );
});

// Show a service's admin enablement and independent health state.
const ServiceCard = memo(function ServiceCard({ service, pending, onToggle, t }) {
  const statusLabel = !service.enabled
    ? "disabledByAdmin"
    : service.online
      ? "online"
      : "notReachable";
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-black">{service.name}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={service.enabled ? "success" : "neutral"}>{t(service.enabled ? "admin.knowledgeBase.enabled" : "admin.knowledgeBase.disabled")}</Badge>
            <Badge tone={!service.enabled ? "neutral" : service.online ? "success" : "danger"}>{t(`admin.knowledgeBase.${statusLabel}`)}</Badge>
          </div>
        </div>
        <Toggle
          checked={service.enabled}
          disabled={pending}
          label={`${t("admin.knowledgeBase.enableService")} ${service.name}`}
          onChange={(enabled) => onToggle(service, enabled)}
        />
      </div>
      {pending && <p className="mt-3 text-sm font-bold text-ink-muted">{t("admin.knowledgeBase.switching")}</p>}
    </Card>
  );
});

// Render one model row so unrelated usage events can leave it unchanged.
const ModelUsageRow = memo(function ModelUsageRow({ model, share, lang, onSelect, format, t }) {
  const modelStatus = !model.enabled ? "disabledByAdmin" : model.online ? "online" : "notReachable";
  return (
    <tr tabIndex="0" role="button" onClick={() => onSelect(model.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(model.id); }} className="cursor-pointer border-t border-line hover:bg-brand-50 focus:bg-brand-50">
      <td dir="ltr" className="px-4 py-3 font-bold">{model.model}</td>
      <td className="px-4 py-3">{t(`admin.knowledgeBase.providers.${model.provider}`)}</td>
      <td className="px-4 py-3"><Badge tone={modelStatus === "online" ? "success" : modelStatus === "notReachable" ? "danger" : "neutral"}>{t(`admin.knowledgeBase.${modelStatus}`)}</Badge></td>
      <td dir="ltr" className="px-4 py-3">{model.queries ? format(model.queries) : "—"}</td>
      <td dir="ltr" className="px-4 py-3">{model.queries ? format(model.tokens_today) : "—"}</td>
      <td dir="ltr" className="px-4 py-3">{model.queries ? format(model.tokens_this_month) : "—"}</td>
      <td dir="ltr" className="px-4 py-3">{model.queries ? `${format(model.average_response_time_ms)} ${t("admin.knowledgeBase.ms")}` : "—"}</td>
      <td dir="ltr" className="px-4 py-3">{model.last_used ? new Date(model.last_used).toLocaleString(lang === "ur" ? "ur-PK" : "en-US") : "—"}</td>
      <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-700" style={{ width: `${share}%` }} /></div><span dir="ltr">{share}%</span></div></td>
    </tr>
  );
});

// Draw a lightweight token-use line chart without another chart dependency.
const UsageChart = memo(function UsageChart({ series, number, t }) {
  if (!series?.length) {
    return <div className="flex h-40 items-center justify-center rounded-xl bg-surface text-sm text-ink-muted">{t("admin.knowledgeBase.noQueriesYet")}</div>;
  }
  const values = series.map((point) => point.tokens_in + point.tokens_out);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 90 - (value / max) * 78;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between text-sm text-ink-muted">
        <span>{t("admin.knowledgeBase.tokensOverTime")}</span>
        <span dir="ltr">{number.format(values.reduce((sum, value) => sum + value, 0))} {t("admin.knowledgeBase.tokens")}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label={t("admin.knowledgeBase.tokensOverTime")}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-brand-700" />
      </svg>
      <div className="flex justify-between gap-2 overflow-hidden text-xs text-ink-muted">
        <span dir="ltr">{series[0].period}</span>
        <span dir="ltr">{series[series.length - 1].period}</span>
      </div>
    </div>
  );
});

// Keep the summary layout while the first admin snapshot loads.
function SkeletonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading chatbot usage">
      {Array.from({ length: 4 }, (_, index) => <Card key={index} className="h-28 animate-pulse bg-surface" />)}
    </div>
  );
}

// Convert backend settings into editable form values.
function settingsFrom(data) {
  if (!data?.config) return null;
  return {
    primary_provider: data.config.primary_provider,
    active_model: data.active_model?.name || "",
    fallback_model: data.config.fallback_model || data.config.ollama_model || "",
    auto_fallback_enabled: Boolean(data.config.auto_fallback_enabled),
    monthly_token_limit: String(data.config.monthly_token_limit ?? 0),
    dirty: false,
  };
}

// Monitor connected chatbot services and let administrators manage model use.
export default function AdminKnowledgeBase() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingService, setPendingService] = useState("");
  const [serviceToDisable, setServiceToDisable] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [usageRange, setUsageRange] = useState("week");
  const [usageDetail, setUsageDetail] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");

  const number = useMemo(() => new Intl.NumberFormat(lang === "ur" ? "ur-PK" : "en-US"), [lang]);
  const format = useCallback((value) => numberFormat(value, number), [number]);

  // Load the page snapshot and live model list from the admin REST endpoints.
  const loadAll = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const [snapshot, modelInfo] = await Promise.all([
        chatbotAdminService.getMonitoring(),
        chatbotAdminService.getModels(),
      ]);
      const result = { ...snapshot, ...modelInfo, models: modelInfo.models };
      setData(result);
      setForm((previous) => previous?.dirty ? previous : settingsFrom(result));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || t("admin.knowledgeBase.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  // Apply each small server event to only the state it changes.
  const applyEvents = useCallback((events) => {
    events.forEach((event) => {
      if (["model_changed", "settings_changed", "fallback_triggered", "fallback_cleared"].includes(event.type) && event.data?.config) {
        setForm((previous) => {
          if (previous?.dirty) return previous;
          const nextConfig = event.data.config;
          const activeName = event.data.active_model?.name || (nextConfig.primary_provider === "groq" ? nextConfig.groq_model : nextConfig.ollama_model);
          return settingsFrom({ ...event.data, active_model: { name: activeName } });
        });
      }
    });
    setData((current) => {
      if (!current) return current;
      return events.reduce((next, event) => {
        const update = event.data || {};
        if (event.type === "query_completed") {
          const models = update.model
            ? next.models.map((item) => item.id === update.model.id ? update.model : item)
            : next.models;
          return { ...next, usage: update.usage || next.usage, models };
        }
        if (event.type === "service_status_changed") {
          return { ...next, service: update.service || next.service, services: update.services || next.services, providers: update.providers || next.providers };
        }
        if (["model_changed", "settings_changed", "fallback_triggered", "fallback_cleared"].includes(event.type)) {
          const result = {
            ...next,
            active_model: update.active_model || next.active_model,
            config: update.config || next.config,
            usage: update.usage || next.usage,
          };
          if (event.type === "fallback_triggered") {
            result.config = { ...result.config, fallback_active: true };
            result.usage = { ...result.usage, last_fallback_reason: update.reason, last_fallback_at: update.at };
          }
          if (event.type === "fallback_cleared") result.config = { ...result.config, fallback_active: false };
          return result;
        }
        return next;
      }, current);
    });
  }, []);

  // A reconnect requests one fresh snapshot to cover events missed while offline.
  const connection = useAdminSocket({
    onInitialState: (snapshot) => {
      setData((current) => ({ ...current, ...snapshot, models: snapshot.models || current?.models || [] }));
      setForm((previous) => previous?.dirty ? previous : settingsFrom(snapshot));
      setError("");
    },
    onEvents: applyEvents,
    onReconnect: () => loadAll(true),
  });

  useEffect(() => { loadAll(); }, [loadAll]);

  // Use REST every 30 seconds only while the socket is reconnecting or disconnected.
  useEffect(() => {
    if (connection === "connected") return undefined;
    const timer = window.setInterval(() => loadAll(true), 30000);
    return () => window.clearInterval(timer);
  }, [connection, loadAll]);

  // Fetch one model's usage only while its detail panel is open.
  useEffect(() => {
    if (!selectedModel) return undefined;
    let cancelled = false;
    setUsageLoading(true);
    setUsageError("");
    chatbotAdminService.getModelUsage(selectedModel, usageRange)
      .then((result) => { if (!cancelled) setUsageDetail(result); })
      .catch((err) => { if (!cancelled) setUsageError(err?.response?.data?.detail || t("admin.knowledgeBase.usageError")); })
      .finally(() => { if (!cancelled) setUsageLoading(false); });
    return () => { cancelled = true; };
  }, [selectedModel, usageRange, t]);

  // Show a short success message after an admin action.
  const showNotice = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4000);
  }, []);

  // Save a service toggle and wait for the server to confirm it.
  const saveServiceState = useCallback(async (service, enabled) => {
    setPendingService(service.id);
    setError("");
    try {
      const updated = await chatbotAdminService.updateService(service.id, enabled);
      setData((current) => current && ({
        ...current,
        services: current.services.map((item) => item.id === service.id ? { ...item, ...updated } : item),
      }));
      await loadAll(true);
      setServiceToDisable(null);
      showNotice(t("admin.knowledgeBase.serviceSaved"));
    } catch (err) {
      const message = err?.response?.data?.detail || t("admin.knowledgeBase.serviceError");
      setError(message);
      throw new Error(message);
    } finally {
      setPendingService("");
    }
  }, [loadAll, showNotice, t]);

  // Ask for confirmation before turning a service off.
  const toggleService = useCallback(async (service, enabled) => {
    if (!enabled) {
      setServiceToDisable(service);
      return;
    }
    try {
      await saveServiceState(service, true);
    } catch {
      // saveServiceState displays the returned server error in the page alert.
    }
  }, [saveServiceState]);

  // Track unsaved changes in the model settings form.
  const markDirty = (key, value) => setForm((current) => ({ ...current, [key]: value, dirty: true }));
  const providerOptions = Object.keys(data?.providers || {});
  const activeModels = (data?.models || []).filter((item) => item.provider === form?.primary_provider);
  const fallbackModels = (data?.models || []).filter((item) => item.provider === "ollama");
  const activeModelStatus = activeModels.find((item) => item.model === form?.active_model);
  const fallbackModelStatus = fallbackModels.find((item) => item.model === form?.fallback_model);
  const config = data?.config || {};
  const dirty = Boolean(form && (
    form.primary_provider !== config.primary_provider ||
    form.active_model !== data?.active_model?.name ||
    form.fallback_model !== (config.fallback_model || config.ollama_model) ||
    form.auto_fallback_enabled !== config.auto_fallback_enabled ||
    Number(form.monthly_token_limit) !== Number(config.monthly_token_limit)
  ));

  // Save model, fallback and token-limit settings.
  const saveSettings = async (event) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      await chatbotAdminService.updateSettings({
        primary_provider: form.primary_provider,
        active_model: form.active_model,
        auto_fallback_enabled: form.auto_fallback_enabled,
        fallback_model: form.fallback_model,
        monthly_token_limit: Number(form.monthly_token_limit || 0),
      });
      setForm((current) => ({ ...current, dirty: false }));
      await loadAll(true);
      showNotice(t("admin.knowledgeBase.settingsSaved"));
    } catch (err) {
      setError(err?.response?.data?.detail || t("admin.knowledgeBase.saveError"));
    } finally {
      setSaving(false);
    }
  };

  // Switch back to GroqCloud after a successful fallback.
  const returnToPrimary = async () => {
    setSaving(true);
    setError("");
    try {
      await chatbotAdminService.returnToPrimary();
      await loadAll(true);
      showNotice(t("admin.knowledgeBase.returnedToPrimary"));
    } catch (err) {
      setError(err?.response?.data?.detail || t("admin.knowledgeBase.saveError"));
    } finally {
      setSaving(false);
    }
  };

  // Download the selected model's usage report.
  const exportUsage = async () => {
    try {
      const blob = await chatbotAdminService.downloadUsage(selectedModel, usageRange);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `model-usage-${usageRange}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setUsageError(err?.response?.data?.detail || t("admin.knowledgeBase.exportError"));
    }
  };

  // Pick the first reachable model when the selected provider changes.
  const changeProvider = (provider) => {
    const model = (data.models || []).find((item) => item.provider === provider && item.model === form.active_model && item.online && item.enabled)
      || (data.models || []).find((item) => item.provider === provider && item.online && item.enabled);
    setForm((current) => ({ ...current, primary_provider: provider, active_model: model?.model || "", dirty: true }));
  };

  const totalTokens = (data?.models || []).reduce((sum, item) => sum + item.tokens_this_month, 0);
  const detailModel = (data?.models || []).find((item) => item.id === selectedModel);

  return (
    <>
      <PageHeader title={t("admin.nav.knowledgeBase")} subtitle={t("admin.knowledgeBase.subtitle")} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${connection === "connected" ? "bg-emerald-500" : connection === "reconnecting" ? "bg-amber-500" : "bg-red-500"}`} />
          <span className="text-sm font-bold">{t(`admin.knowledgeBase.connection.${connection}`)}</span>
          {connection === "connected" && <Badge tone="success">{t("admin.knowledgeBase.live")}</Badge>}
        </div>
        <Button variant="secondary" size="sm" fullWidth={false} loading={refreshing} onClick={() => loadAll(true)}>
          {t("admin.knowledgeBase.refresh")}
        </Button>
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {notice && <div className="mb-4"><Alert type="info">{notice}</Alert></div>}

      {loading && !data ? <SkeletonCards /> : (
        <>
          {data?.config?.fallback_active && (
            <Card className="mb-5 border-amber-300 bg-amber-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-black text-amber-900">{t("admin.knowledgeBase.fallbackActive")}</h2>
                  <p className="mt-1 text-sm text-amber-900">
                    {t("admin.knowledgeBase.lastFallback")}: {t(`admin.knowledgeBase.reasons.${data.usage?.last_fallback_reason || "api_error"}`)}
                    {data.usage?.last_fallback_at && <span dir="ltr"> · {new Date(data.usage.last_fallback_at).toLocaleString(lang === "ur" ? "ur-PK" : "en-US")}</span>}
                  </p>
                </div>
                <Button size="sm" fullWidth={false} loading={saving} onClick={returnToPrimary}>{t("admin.knowledgeBase.returnToPrimary")}</Button>
              </div>
            </Card>
          )}

          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div><p className="text-sm font-bold text-ink-muted">{t("admin.knowledgeBase.activeModel")}</p><p dir="ltr" className="mt-1 text-xl font-black">{data?.active_model?.name || "—"}</p><p className="mt-1 text-sm text-ink-muted">{t(`admin.knowledgeBase.providers.${data?.active_model?.provider || "groq"}`)}</p></div>
              <StatusBadge status={data?.active_model?.status} t={t} />
            </Card>
            <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div><p className="text-sm font-bold text-ink-muted">{t("admin.knowledgeBase.service")}</p><p className="mt-1 text-xl font-black">{data?.service?.name || t("admin.knowledgeBase.medicalAssistant")}</p></div>
              <StatusBadge status={data?.service?.status} t={t} />
            </Card>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={t("admin.knowledgeBase.queriesProcessed")} value={data?.usage?.queries_processed ? format(data.usage.queries_processed) : t("admin.knowledgeBase.noQueriesYet")} detail={t("admin.knowledgeBase.allTime")} />
            <MetricCard label={t("admin.knowledgeBase.averageResponseTime")} value={data?.usage?.queries_this_month ? `${format(data.usage.average_response_time_ms)} ${t("admin.knowledgeBase.ms")}` : "—"} detail={data?.usage?.queries_this_month ? t("admin.knowledgeBase.thisMonth") : t("admin.knowledgeBase.noQueriesYet")} />
            <MetricCard label={t("admin.knowledgeBase.tokensToday")} value={data?.usage?.queries_today ? format(data.usage.tokens_today) : t("admin.knowledgeBase.noQueriesYet")} detail={`${format(data?.usage?.queries_today)} ${t("admin.knowledgeBase.queriesToday").toLowerCase()}`} />
            <MetricCard label={t("admin.knowledgeBase.tokensThisMonth")} value={data?.usage?.queries_this_month ? format(data.usage.tokens_this_month) : t("admin.knowledgeBase.noQueriesYet")} detail={`${format(data?.usage?.queries_this_month)} ${t("admin.knowledgeBase.queriesThisMonth").toLowerCase()}`} />
          </div>

          <section className="mb-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-black">{t("admin.knowledgeBase.servicesTitle")}</h2>
                <p className="mt-1 text-sm text-ink-muted">{t("admin.knowledgeBase.servicesHint")}</p>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {(data?.services || []).map((service) => (
                <ServiceCard key={service.id} service={service} pending={pendingService === service.id} onToggle={toggleService} t={t} />
              ))}
            </div>
          </section>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">{t("admin.knowledgeBase.groqAllowance")}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{t("admin.knowledgeBase.groqAllowanceHint")}</p>
                </div>
                <StatusBadge status={data?.providers?.groq?.status} t={t} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div><p className="text-sm text-ink-muted">{t("admin.knowledgeBase.groqTokensUsed")}</p><p dir="ltr" className="mt-1 text-2xl font-black">{format(data?.usage?.groq_tokens_this_month)}</p></div>
                <div><p className="text-sm text-ink-muted">{t("admin.knowledgeBase.tokensRemaining")}</p><p dir="ltr" className="mt-1 text-2xl font-black text-brand-700">{format(data?.usage?.monthly_tokens_remaining)}</p></div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-lg font-black">{t("admin.knowledgeBase.fallbackTitle")}</h2><p className="mt-1 text-sm text-ink-muted">{t("admin.knowledgeBase.fallbackHint")}</p></div>
                <Badge tone={data?.config?.auto_fallback_enabled ? "success" : "neutral"}>{t(data?.config?.auto_fallback_enabled ? "admin.knowledgeBase.enabled" : "admin.knowledgeBase.disabled")}</Badge>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div><p className="text-sm text-ink-muted">{t("admin.knowledgeBase.fallbacksThisMonth")}</p><p dir="ltr" className="mt-1 text-2xl font-black">{format(data?.usage?.fallbacks_this_month)}</p></div>
                <div>
                  <p className="text-sm text-ink-muted">{t("admin.knowledgeBase.lastFallback")}</p>
                  <p className="mt-1 font-bold">{data?.usage?.last_fallback_reason ? t(`admin.knowledgeBase.reasons.${data.usage.last_fallback_reason}`) : t("admin.knowledgeBase.noFallbackYet")}</p>
                  {data?.usage?.last_fallback_at && <p dir="ltr" className="mt-1 text-sm text-ink-muted">{new Date(data.usage.last_fallback_at).toLocaleString(lang === "ur" ? "ur-PK" : "en-US")}</p>}
                </div>
              </div>
            </Card>
          </div>

          <Card className="mb-6 p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-xl font-black">{t("admin.knowledgeBase.modelControl")}</h2><p className="mt-1 text-sm text-ink-muted">{t("admin.knowledgeBase.modelControlHint")}</p></div>
              {dirty && <Badge tone="warning">{t("admin.knowledgeBase.unsavedChanges")}</Badge>}
            </div>
            <form onSubmit={saveSettings} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
              <Select id="active-provider" label={t("admin.knowledgeBase.provider")} value={form?.primary_provider || ""} onChange={(event) => changeProvider(event.target.value)}>
                {providerOptions.map((provider) => <option key={provider} value={provider} disabled={provider !== form?.primary_provider && !data.models.some((item) => item.provider === provider && item.online && item.enabled)}>{t(`admin.knowledgeBase.providers.${provider}`)}</option>)}
              </Select>
              <Select id="active-model" label={t("admin.knowledgeBase.model")} value={form?.active_model || ""} onChange={(event) => markDirty("active_model", event.target.value)}>
                {activeModels.map((model) => <option key={model.id} value={model.model} disabled={!model.online || !model.enabled}>
                  {model.online && model.enabled ? "●" : "○"} {model.model} · {format(model.tokens_this_month)} {t("admin.knowledgeBase.tokensThisMonthShort")}
                </option>)}
              </Select>
              <Input id="monthly-token-limit" type="number" min="0" step="1" dir="ltr" label={t("admin.knowledgeBase.monthlyLimit")} value={form?.monthly_token_limit ?? "0"} onChange={(event) => markDirty("monthly_token_limit", event.target.value)} />
              <Button type="submit" loading={saving} disabled={!dirty || !activeModelStatus?.online || !activeModelStatus?.enabled || (form?.auto_fallback_enabled && (!fallbackModelStatus?.online || !fallbackModelStatus?.enabled))}>{t("admin.knowledgeBase.saveSettings")}</Button>

              <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 md:col-span-2 xl:col-span-4">
                <Toggle checked={Boolean(form?.auto_fallback_enabled)} onChange={(value) => markDirty("auto_fallback_enabled", value)} label={t("admin.knowledgeBase.autoFallbackLabel")} />
                <span className="font-bold">{t("admin.knowledgeBase.autoFallbackLabel")}</span>
              </div>
              <Select id="fallback-model" label={t("admin.knowledgeBase.fallbackModel")} value={form?.fallback_model || ""} onChange={(event) => markDirty("fallback_model", event.target.value)}>
                {fallbackModels.map((model) => <option key={model.id} value={model.model} disabled={!model.online || !model.enabled}>{model.online && model.enabled ? "●" : "○"} {model.model} · {format(model.tokens_this_month)} {t("admin.knowledgeBase.tokensThisMonthShort")}</option>)}
              </Select>
              <p className="text-sm text-ink-muted md:col-span-2 xl:col-span-3">{t("admin.knowledgeBase.fallbackControlHint")}</p>
            </form>
          </Card>

          <Card className="mb-6 overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-2 p-5 pb-3">
              <div><h2 className="text-xl font-black">{t("admin.knowledgeBase.modelUsageTitle")}</h2><p className="mt-1 text-sm text-ink-muted">{t("admin.knowledgeBase.modelUsageHint")}</p></div>
            </div>
            {!data?.usage?.queries_this_month && <p className="px-5 pb-4 text-sm text-ink-muted">{t("admin.knowledgeBase.noQueriesYet")}</p>}
            {data?.models?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-start text-sm">
                  <thead className="bg-surface text-ink-muted"><tr>
                    {["model", "provider", "status", "queries", "tokensToday", "tokensThisMonth", "averageResponseTime", "lastUsed", "tokenShare"].map((key) => <th key={key} className="px-4 py-3 font-bold">{t(`admin.knowledgeBase.columns.${key}`)}</th>)}
                  </tr></thead>
                  <tbody>
                    {data.models.map((model) => <ModelUsageRow key={model.id} model={model} share={totalTokens ? Math.round((model.tokens_this_month / totalTokens) * 100) : 0} lang={lang} onSelect={setSelectedModel} format={format} t={t} />)}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-5 pb-5 text-sm text-ink-muted">{t("admin.knowledgeBase.noModels")}</p>}
          </Card>

          {selectedModel && (
            <Card className="mb-6 p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-xl font-black">{t("admin.knowledgeBase.usageDetail")}</h2><p dir="ltr" className="mt-1 text-sm text-ink-muted">{detailModel?.model || usageDetail?.model}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select id="detail-model" label="" aria-label={t("admin.knowledgeBase.model")} value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
                    {(data?.models || []).map((model) => <option key={model.id} value={model.id}>{model.model}</option>)}
                  </Select>
                  <Select id="usage-range" label="" aria-label={t("admin.knowledgeBase.dateRange")} value={usageRange} onChange={(event) => setUsageRange(event.target.value)}>
                    {["day", "week", "month"].map((range) => <option key={range} value={range}>{t(`admin.knowledgeBase.ranges.${range}`)}</option>)}
                  </Select>
                  <Button variant="secondary" size="sm" fullWidth={false} onClick={exportUsage}>{t("admin.knowledgeBase.exportCsv")}</Button>
                </div>
              </div>
              {usageError && <div className="mb-4"><Alert>{usageError}</Alert></div>}
              {usageLoading ? <div className="h-40 animate-pulse rounded-xl bg-surface" /> : usageDetail?.queries ? (
                <>
                  <UsageChart series={usageDetail?.series} number={number} t={t} />
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["queries", usageDetail?.queries],
                      ["tokensIn", usageDetail?.tokens_in],
                      ["tokensOut", usageDetail?.tokens_out],
                      ["averageResponseTime", usageDetail?.average_response_time_ms],
                      ["slowestResponseTime", usageDetail?.slowest_response_time_ms],
                      ["errors", usageDetail?.error_count],
                      ["fallbacks", usageDetail?.fallback_count],
                    ].map(([key, value]) => <div key={key} className="rounded-xl bg-surface p-4"><p className="text-sm text-ink-muted">{t(`admin.knowledgeBase.detailStats.${key}`)}</p><p dir="ltr" className="mt-1 text-xl font-black">{format(value)}{key.toLowerCase().includes("time") ? ` ${t("admin.knowledgeBase.ms")}` : ""}</p></div>)}
                  </div>
                </>
              ) : <div className="rounded-xl bg-surface px-4 py-8 text-center text-sm text-ink-muted">{t("admin.knowledgeBase.noQueriesYet")}</div>}
            </Card>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(serviceToDisable)}
        title={t("admin.knowledgeBase.disableServiceTitle")}
        itemName={serviceToDisable?.name}
        message={t("admin.knowledgeBase.disableServiceWarning")}
        confirmLabel={t("admin.knowledgeBase.disableService")}
        onConfirm={() => saveServiceState(serviceToDisable, false)}
        onClose={() => setServiceToDisable(null)}
      />
    </>
  );
}
