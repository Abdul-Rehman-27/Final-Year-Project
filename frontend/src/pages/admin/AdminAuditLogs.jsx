import { useCallback, useEffect, useMemo, useState } from "react";

import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import Input from "../../components/common/Input.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import Select from "../../components/common/Select.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { auditLogService } from "../../services/auditLogService.js";

const PAGE_SIZE = 25;

function prettyAction(action, t) {
  const key = `admin.audit.actions.${action}`;
  const translated = t(key);
  return translated === key ? action.replaceAll("_", " ") : translated;
}

function translatedCount(key, values, t) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key));
}

function AuditValues({ oldValue, newValue, t }) {
  const hasOld = oldValue && Object.keys(oldValue).length > 0;
  const hasNew = newValue && Object.keys(newValue).length > 0;
  if (!hasOld && !hasNew) return <span className="text-ink-muted">—</span>;
  return (
    <details className="max-w-[28rem]">
      <summary className="cursor-pointer font-bold text-brand-700">{t("admin.audit.viewChanges")}</summary>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        {hasOld && <div className="min-w-0"><p className="mb-1 font-bold">{t("admin.audit.before")}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-2">{JSON.stringify(oldValue, null, 2)}</pre></div>}
        {hasNew && <div className="min-w-0"><p className="mb-1 font-bold">{t("admin.audit.after")}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-2">{JSON.stringify(newValue, null, 2)}</pre></div>}
      </div>
    </details>
  );
}

export default function AdminAuditLogs() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState({ items: [], total: 0, pages: 0, actions: [] });
  const [filters, setFilters] = useState({ search: "", action: "", target: "", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, page, page_size: PAGE_SIZE }).filter(([, value]) => value !== ""));
      const result = await auditLogService.list(params);
      setData(result);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.detail || t("admin.audit.loadError"));
    } finally {
      setLoading(false);
    }
  }, [filters, page, t]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const exportLogs = async () => {
    setExporting(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""));
      const blob = await auditLogService.export(params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cityhospital-audit-logs.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.detail || t("admin.audit.exportError"));
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo(() => [
    { header: t("admin.audit.cols.time"), className: "whitespace-nowrap", render: (row) => new Date(row.created_at).toLocaleString(lang === "ur" ? "ur-PK" : "en-US") },
    { header: t("admin.audit.cols.admin"), render: (row) => <div><p className="font-bold">{row.admin_name}</p>{row.admin_email && <p dir="ltr" className="text-sm text-ink-muted">{row.admin_email}</p>}</div> },
    { header: t("admin.audit.cols.action"), render: (row) => <span className="font-bold capitalize">{prettyAction(row.action, t)}</span> },
    { header: t("admin.audit.cols.target"), render: (row) => <span className="break-all">{row.target}</span> },
    { header: t("admin.audit.cols.changes"), render: (row) => <AuditValues oldValue={row.old_value} newValue={row.new_value} t={t} /> },
  ], [lang, t]);

  return (
    <>
      <PageHeader title={t("admin.nav.auditLogs")} subtitle={t("admin.audit.subtitle")} />
      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2"><Input id="audit-search" label={t("admin.audit.search")} placeholder={t("admin.audit.searchPlaceholder")} value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} /></div>
          <Select id="audit-action" label={t("admin.audit.actionFilter")} value={filters.action} onChange={(event) => updateFilter("action", event.target.value)}>
            <option value="">{t("admin.audit.allActions")}</option>
            {data.actions.map((action) => <option key={action} value={action}>{prettyAction(action, t)}</option>)}
          </Select>
          <Input id="audit-target" label={t("admin.audit.targetFilter")} placeholder={t("admin.audit.targetPlaceholder")} value={filters.target} onChange={(event) => updateFilter("target", event.target.value)} />
          <Input id="audit-from" type="date" label={t("admin.audit.from")} value={filters.date_from} onChange={(event) => updateFilter("date_from", event.target.value)} />
          <Input id="audit-to" type="date" label={t("admin.audit.to")} value={filters.date_to} onChange={(event) => updateFilter("date_to", event.target.value)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">{translatedCount("admin.audit.total", { count: data.total }, t)}</p>
          <Button size="sm" fullWidth={false} variant="secondary" loading={exporting} onClick={exportLogs}>{t("admin.audit.export")}</Button>
        </div>
      </Card>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <Card className="overflow-hidden">
        <DataTable columns={columns} rows={data.items} loading={loading} loadingText={t("common.loading")} emptyText={t("admin.audit.empty")} />
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 text-sm">
          <Button size="sm" fullWidth={false} variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>{t("admin.audit.previous")}</Button>
          <span dir="ltr" className="text-ink-muted">{translatedCount("admin.audit.page", { page, pages: Math.max(data.pages, 1) }, t)}</span>
          <Button size="sm" fullWidth={false} variant="secondary" disabled={page >= data.pages || loading} onClick={() => setPage((value) => value + 1)}>{t("admin.audit.next")}</Button>
        </div>
      </Card>
    </>
  );
}
