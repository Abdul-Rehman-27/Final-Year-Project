import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { useLanguage } from "../../context/LanguageContext.jsx";
import { STAFF_STATUSES } from "../../config/staffRoles.js";
import { roleName } from "../../utils/roles.js";
import { staffSchema } from "../../utils/validators.js";
import Alert from "../common/Alert.jsx";
import Button from "../common/Button.jsx";
import ImageUpload from "../common/ImageUpload.jsx";
import Input from "../common/Input.jsx";
import Modal from "../common/Modal.jsx";
import Select from "../common/Select.jsx";

const EMPTY = { fullName: "", email: "", phone: "", photo: "", role: "", departmentId: "", specialty: "", fee: "", status: "active" };

/**
 * Add / edit staff dialog.
 *  - member = null  -> "Add staff"
 *  - member = {...} -> "Edit staff" (email is locked)
 *  - roles / departments come from the Roles and Departments pages (admin-defined)
 *  - onSubmit(values) may throw { code: "EMAIL_TAKEN" }
 */
export default function StaffFormModal({ open, member, roles = [], departments = [], onClose, onSubmit }) {
  const { t, lang } = useLanguage();
  const isEdit = !!member;
  const [serverError, setServerError] = useState("");

  const schema = useMemo(() => staffSchema(t), [t]);
  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    trigger,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: EMPTY });

  const role = watch("role");

  // Fill the form each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setServerError("");
    reset(member ? { ...EMPTY, ...member, fee: String(member.fee ?? ""), departmentId: String(member.departmentId ?? "") } : EMPTY);
  }, [open, member, reset]);

  // Translate visible error messages when the language changes
  useEffect(() => {
    if (Object.keys(errors).length) trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const submit = async (values) => {
    setServerError("");
    try {
      await onSubmit({
        ...values,
        departmentId: Number(values.departmentId),
        fee: values.role === "doctor" ? Number(values.fee) : "",
        specialty: values.role === "doctor" ? values.specialty : "",
      });
    } catch (err) {
      if (err?.code === "EMAIL_TAKEN") setError("email", { type: "server", message: t("admin.errors.emailTaken") });
      else setServerError(t("auth.errors.generic"));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t(isEdit ? "admin.editStaff" : "admin.addStaff")}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        {serverError && <Alert>{serverError}</Alert>}

        <Controller
          name="photo"
          control={control}
          render={({ field }) => <ImageUpload value={field.value} onChange={field.onChange} />}
        />

        <Input id="staff-name" label={t("auth.fields.fullName")} error={errors.fullName?.message} {...register("fullName")} />

        <Input
          id="staff-email"
          label={t("auth.fields.email")}
          type="email"
          dir="ltr"
          disabled={isEdit}
          error={errors.email?.message}
          {...register("email")}
        />

        <Input
          id="staff-phone"
          label={t("admin.form.contact")}
          type="tel"
          dir="ltr"
          inputMode="tel"
          placeholder={t("auth.placeholders.phone")}
          error={errors.phone?.message}
          {...register("phone")}
        />

        <Select id="staff-role" label={t("admin.table.role")} error={errors.role?.message} {...register("role")}>
          <option value="">{t("admin.form.selectRole")}</option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {roleName(t, r)}
            </option>
          ))}
        </Select>

        <Select
          id="staff-department"
          label={t("admin.form.department")}
          error={errors.departmentId?.message}
          {...register("departmentId")}
        >
          <option value="">{t("admin.form.selectDepartment")}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>

        {/* Only doctors have a specialty and a consultation fee */}
        {role === "doctor" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="staff-specialty"
              label={t("admin.form.specialty")}
              placeholder={t("admin.form.specialtyPlaceholder")}
              error={errors.specialty?.message}
              {...register("specialty")}
            />
            <Input
              id="staff-fee"
              label={t("admin.form.fee")}
              type="number"
              dir="ltr"
              min="100"
              placeholder="2500"
              error={errors.fee?.message}
              {...register("fee")}
            />
          </div>
        )}

        {isEdit && (
          <Select id="staff-status" label={t("admin.table.status")} {...register("status")}>
            {STAFF_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.status.${s}`)}
              </option>
            ))}
          </Select>
        )}

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
