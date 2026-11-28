import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useLanguage } from "../../context/LanguageContext.jsx";
import { roleName } from "../../utils/roles.js";
import { roleSchema } from "../../utils/validators.js";
import Alert from "../common/Alert.jsx";
import Button from "../common/Button.jsx";
import Input from "../common/Input.jsx";
import Modal from "../common/Modal.jsx";
import Textarea from "../common/Textarea.jsx";

const EMPTY = { name: "", description: "" };

/** Add / edit role. The name of a system role is locked. onSubmit(values) may throw { code: "NAME_TAKEN" }. */
export default function RoleFormModal({ open, role, onClose, onSubmit }) {
  const { t, lang } = useLanguage();
  const isEdit = !!role;
  const [serverError, setServerError] = useState("");
  const schema = useMemo(() => roleSchema(t), [t]);
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
    reset(role ? { name: role.name, description: role.description || "" } : EMPTY);
  }, [open, role, reset]);

  useEffect(() => {
    if (Object.keys(errors).length) trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const submit = async (values) => {
    setServerError("");
    try {
      await onSubmit(values);
    } catch (err) {
      if (err?.code === "NAME_TAKEN") setError("name", { type: "server", message: t("admin.rolesPage.nameTaken") });
      else setServerError(t("auth.errors.generic"));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t(isEdit ? "admin.rolesPage.edit" : "admin.rolesPage.add")}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        {serverError && <Alert>{serverError}</Alert>}
        {role?.system ? (
          // System role: show the translated name, it cannot be renamed
          <div>
            <p className="mb-1.5 text-sm font-bold">{t("admin.rolesPage.name")}</p>
            <p className="rounded-xl border border-line bg-surface px-4 py-3">{roleName(t, role)}</p>
          </div>
        ) : (
          <Input
            id="role-name"
            label={t("admin.rolesPage.name")}
            placeholder={t("admin.rolesPage.namePlaceholder")}
            error={errors.name?.message}
            {...register("name")}
          />
        )}
        <Textarea
          id="role-description"
          label={t("admin.rolesPage.description")}
          placeholder={t("admin.rolesPage.descriptionPlaceholder")}
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
