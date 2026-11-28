import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { CATEGORIES, LANGS } from "../../../config/evaluation.js";
import { useLanguage } from "../../../context/LanguageContext.jsx";
import { benchmarkQuerySchema } from "../../../utils/validators.js";
import Alert from "../../common/Alert.jsx";
import Button from "../../common/Button.jsx";
import Input from "../../common/Input.jsx";
import Modal from "../../common/Modal.jsx";
import Select from "../../common/Select.jsx";
import Textarea from "../../common/Textarea.jsx";

const EMPTY = { lang: "en", category: "", query: "", truth: "" };

/** Add / edit one benchmark query with its ground-truth label. */
export default function QueryFormModal({ open, item, onClose, onSubmit }) {
  const { t, lang } = useLanguage();
  const isEdit = !!item;
  const [serverError, setServerError] = useState("");
  const schema = useMemo(() => benchmarkQuerySchema(t), [t]);
  const {
    register,
    handleSubmit,
    reset,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: EMPTY });

  const queryLang = watch("lang");

  useEffect(() => {
    if (!open) return;
    setServerError("");
    reset(item ? { lang: item.lang, category: item.category, query: item.query, truth: item.truth } : EMPTY);
  }, [open, item, reset]);

  useEffect(() => {
    if (Object.keys(errors).length) trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const submit = async (values) => {
    setServerError("");
    try {
      await onSubmit(values);
    } catch {
      setServerError(t("auth.errors.generic"));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t(isEdit ? "admin.evaluation.benchmark.edit" : "admin.evaluation.benchmark.add")}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        {serverError && <Alert>{serverError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select id="q-lang" label={t("admin.evaluation.benchmark.form.language")} error={errors.lang?.message} {...register("lang")}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`admin.evaluation.languages.${l}`)}
              </option>
            ))}
          </Select>
          <Select id="q-category" label={t("admin.evaluation.benchmark.form.category")} error={errors.category?.message} {...register("category")}>
            <option value="">{t("admin.evaluation.benchmark.form.selectCategory")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`admin.evaluation.categories.${c}`)}
              </option>
            ))}
          </Select>
        </div>

        <Textarea
          id="q-query"
          label={t("admin.evaluation.benchmark.form.query")}
          dir={queryLang === "ur" ? "rtl" : "ltr"}
          className={queryLang === "ur" ? "font-urdu" : ""}
          error={errors.query?.message}
          {...register("query")}
        />

        <div>
          <Input id="q-truth" label={t("admin.evaluation.benchmark.form.truth")} dir="ltr" error={errors.truth?.message} {...register("truth")} />
          {!errors.truth && <p className="mt-1.5 text-sm text-ink-muted">{t("admin.evaluation.benchmark.form.truthHint")}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" fullWidth={false} onClick={onClose}>
            {t("admin.form.cancel")}
          </Button>
          <Button type="submit" fullWidth={false} loading={isSubmitting}>
            {t("admin.form.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
