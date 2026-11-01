import { useEffect, useMemo, useState } from "react";

import { CATEGORIES, LANGS, TARGET_PER_LANG, TARGET_TOTAL } from "../../../config/evaluation.js";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { downloadCsv } from "../../../utils/csv.js";
import Alert from "../../common/Alert.jsx";
import Badge from "../../common/Badge.jsx";
import Button from "../../common/Button.jsx";
import Card from "../../common/Card.jsx";
import ConfirmDialog from "../../common/ConfirmDialog.jsx";
import DataTable from "../../common/DataTable.jsx";
import Select from "../../common/Select.jsx";
import QueryFormModal from "./QueryFormModal.jsx";

const PAGE_SIZE = 10;
const code = (q) => `${q.lang.toUpperCase()}-${String(q.id).slice(-4).padStart(3, "0")}`;

function Progress({ label, value, max }) {
  const width = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span dir="ltr" className="text-ink-muted">
          {value} / {max}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-label={label}>
        <div className="h-full rounded-full bg-brand-700 transition-all" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

/** The 400-query bilingual benchmark: progress to target, filters, add / edit / delete, CSV export. */
export default function BenchmarkTab({ queries, loading, addQuery, updateQuery, removeQuery }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ open: false, item: null });
  const [toDelete, setToDelete] = useState(null);
  const [notice, setNotice] = useState("");

  const enCount = queries.filter((q) => q.lang === "en").length;
  const urCount = queries.filter((q) => q.lang === "ur").length;

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return queries.filter(
      (q) =>
        (!langFilter || q.lang === langFilter) &&
        (!catFilter || q.category === catFilter) &&
        (!s || `${q.query} ${q.truth}`.toLowerCase().includes(s))
    );
  }, [queries, search, langFilter, catFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => setPage(1), [search, langFilter, catFilter]);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const closeForm = () => setForm({ open: false, item: null });

  const handleSubmit = async (values) => {
    if (form.item) {
      await updateQuery(form.item.id, values);
      setNotice(t("admin.evaluation.benchmark.updated"));
    } else {
      await addQuery(values);
      setNotice(t("admin.evaluation.benchmark.created"));
    }
    closeForm();
  };

  const handleDelete = async () => {
    await removeQuery(toDelete.id);
    setToDelete(null);
    setNotice(t("admin.evaluation.benchmark.deleted"));
  };

  const exportCsv = () =>
    downloadCsv("benchmark_dataset.csv", [
      ["id", "language", "category", "query", "ground_truth"],
      ...queries.map((q) => [code(q), q.lang, q.category, q.query, q.truth]),
    ]);

  const columns = [
    { header: t("admin.evaluation.benchmark.cols.id"), render: (q) => <span dir="ltr" className="inline-block whitespace-nowrap text-sm text-ink-muted">{code(q)}</span> },
    {
      header: t("admin.evaluation.benchmark.cols.language"),
      render: (q) => <Badge tone={q.lang === "en" ? "success" : "warning"}>{t(`admin.evaluation.languages.${q.lang}`)}</Badge>,
    },
    { header: t("admin.evaluation.benchmark.cols.category"), render: (q) => t(`admin.evaluation.categories.${q.category}`) },
    {
      header: t("admin.evaluation.benchmark.cols.query"),
      render: (q) => (
        <p dir={q.lang === "ur" ? "rtl" : "ltr"} className={`max-w-md ${q.lang === "ur" ? "font-urdu leading-loose" : ""}`}>
          {q.query}
        </p>
      ),
    },
    { header: t("admin.evaluation.benchmark.cols.truth"), render: (q) => <span dir="ltr" className="inline-block font-bold">{q.truth}</span> },
    {
      header: "",
      className: "text-end",
      render: (q) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" fullWidth={false} onClick={() => setForm({ open: true, item: q })}>
            {t("admin.edit")}
          </Button>
          <Button variant="dangerOutline" size="sm" fullWidth={false} onClick={() => setToDelete(q)}>
            {t("admin.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card className="mb-6 p-6">
        <h2 className="text-xl font-black">{t("admin.evaluation.benchmark.title")}</h2>
        <p className="mb-4 text-ink-muted">
          {t("admin.evaluation.benchmark.target")} ·{" "}
          <span dir="ltr" className="inline-block">
            {queries.length} / {TARGET_TOTAL}
          </span>{" "}
          {t("admin.evaluation.benchmark.collected")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Progress label={t("admin.evaluation.languages.en")} value={enCount} max={TARGET_PER_LANG} />
          <Progress label={t("admin.evaluation.languages.ur")} value={urCount} max={TARGET_PER_LANG} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-6 pb-4">
          <div className="min-w-[12rem] flex-1">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.evaluation.benchmark.search")}
              aria-label={t("admin.evaluation.benchmark.search")}
              className="w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20"
            />
          </div>
          <div className="w-44">
            <Select id="f-lang" label="" aria-label={t("admin.evaluation.benchmark.cols.language")} value={langFilter} onChange={(e) => setLangFilter(e.target.value)}>
              <option value="">{t("admin.evaluation.benchmark.allLanguages")}</option>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {t(`admin.evaluation.languages.${l}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-52">
            <Select id="f-cat" label="" aria-label={t("admin.evaluation.benchmark.cols.category")} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">{t("admin.evaluation.benchmark.allCategories")}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`admin.evaluation.categories.${c}`)}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="secondary" size="sm" fullWidth={false} className="mb-1" onClick={exportCsv}>
            {t("admin.evaluation.benchmark.exportDataset")}
          </Button>
          <Button size="sm" fullWidth={false} className="mb-1" onClick={() => setForm({ open: true, item: null })}>
            {t("admin.evaluation.benchmark.add")}
          </Button>
        </div>

        {notice && (
          <div className="px-6 pb-4">
            <Alert type="info">{notice}</Alert>
          </div>
        )}

        <DataTable columns={columns} rows={rows} loading={loading} loadingText={t("common.loading")} emptyText={t("admin.evaluation.benchmark.empty")} />

        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
            <Button variant="secondary" size="sm" fullWidth={false} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("admin.evaluation.benchmark.prev")}
            </Button>
            <span className="text-sm text-ink-muted">
              {t("admin.evaluation.benchmark.page")}{" "}
              <span dir="ltr" className="inline-block">
                {page}
              </span>{" "}
              {t("admin.evaluation.benchmark.of")}{" "}
              <span dir="ltr" className="inline-block">
                {pages}
              </span>
            </span>
            <Button variant="secondary" size="sm" fullWidth={false} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              {t("admin.evaluation.benchmark.next")}
            </Button>
          </div>
        )}
      </Card>

      <QueryFormModal open={form.open} item={form.item} onClose={closeForm} onSubmit={handleSubmit} />
      <ConfirmDialog
        open={!!toDelete}
        title={t("admin.evaluation.benchmark.deleteTitle")}
        itemName={toDelete?.query}
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
