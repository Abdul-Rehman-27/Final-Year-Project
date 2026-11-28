import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useLanguage } from "../../context/LanguageContext.jsx";
import { toCode } from "../../utils/slug.js";
import { permissionSchema } from "../../utils/validators.js";
import Alert from "../common/Alert.jsx";
import Button from "../common/Button.jsx";
import Input from "../common/Input.jsx";
import Modal from "../common/Modal.jsx";
import Textarea from "../common/Textarea.jsx";

const EMPTY = { name: "", code: "", description: "" };

/**
 * Add / edit permission. While adding, the code is suggested from the name until the admin edits it.
 * onSubmit(values) may throw { code: "NAME_TAKEN" | "CODE_TAKEN" }.
 */
export default function PermissionFormModal({ open, permission, onClose, onSubmit }) {
  const { t, lang } = useLanguage();
  const isEdit = !!permission;
  const [serverError, setServerError] = useState("");
  const schema = useMemo(() => permissionSchema(t), [t]);
  const {
    register,
    handleSubmit,
    reset,
    trigger,
    setError,
    setValue,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    setServerError("");
    reset(
      permission
        ? { name: permission.name, code: permission.code, description: permission.description || "" }
        : EMPTY
    );
  }, [open, permission, reset]);

  useEffect(() => {
    if (Object.keys(errors).length) trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const nameField = register("name");
  const onNameChange = (e) => {
    nameField.onChange(e);
    if (!isEdit && !dirtyFields.code) setValue("code", toCode(e.target.value));
  };

  const submit = async (values) => {
    setServerError("");
    try {
      await onSubmit(values);
    } catch (err) {
      if (err?.code === "NAME_TAKEN") setError("name", { type: "server", message: t("admin.permissions.nameTaken") });
      else if (err?.code === "CODE_TAKEN") setError("code", { type: "server", message: t("admin.permissions.codeTaken") });
      else setServerError(t("auth.errors.generic"));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t(isEdit ? "admin.permissions.edit" : "admin.permissions.add")}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        {serverError && <Alert>{serverError}</Alert>}
        <Input
          id="perm-name"
          label={t("admin.permissions.name")}
          placeholder={t("admin.permissions.namePlaceholder")}
          error={errors.name?.message}
          {...nameField}
          onChange={onNameChange}
        />
        <div>
          <Input id="perm-code" label={t("admin.permissions.code")} dir="ltr" error={errors.code?.message} {...register("code")} />
          {!errors.code && <p className="mt-1.5 text-sm text-ink-muted">{t("admin.permissions.codeHint")}</p>}
        </div>
        <Textarea
          id="perm-description"
          label={t("admin.permissions.description")}
          placeholder={t("admin.permissions.descriptionPlaceholder")}
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
