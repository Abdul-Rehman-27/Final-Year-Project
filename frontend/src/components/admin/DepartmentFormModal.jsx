import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useLanguage } from "../../context/LanguageContext.jsx";
import { departmentSchema } from "../../utils/validators.js";
import Alert from "../common/Alert.jsx";
import Button from "../common/Button.jsx";
import Input from "../common/Input.jsx";
import Modal from "../common/Modal.jsx";
import Textarea from "../common/Textarea.jsx";

const EMPTY = { name: "", description: "" };

/** Add / edit department. onSubmit(values) may throw { code: "NAME_TAKEN" }. */
export default function DepartmentFormModal({ open, department, onClose, onSubmit }) {
  const { t, lang } = useLanguage();
  const isEdit = !!department;
  const [serverError, setServerError] = useState("");
  const schema = useMemo(() => departmentSchema(t), [t]);
  const {
    register,
    handleSubmit,
    reset,
    trigger,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    setServerError("");
    reset(department ? { name: department.name, description: department.description || "" } : EMPTY);
  }, [open, department, reset]);

  useEffect(() => {
    if (Object.keys(errors).length) trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const submit = async (values) => {
    setServerError("");
    try {
      await onSubmit(values);
    } catch (err) {
      if (err?.code === "NAME_TAKEN") setError("name", { type: "server", message: t("admin.departments.nameTaken") });
      else setServerError(t("auth.errors.generic"));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t(isEdit ? "admin.departments.edit" : "admin.departments.add")}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        {serverError && <Alert>{serverError}</Alert>}
        <Input
          id="dept-name"
          label={t("admin.departments.name")}
          placeholder={t("admin.departments.namePlaceholder")}
          error={errors.name?.message}
          {...register("name")}
        />
        <Textarea
          id="dept-description"
          label={t("admin.departments.description")}
          placeholder={t("admin.departments.descriptionPlaceholder")}
          error={errors.description?.message}
          {...register("description")}
        />
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
