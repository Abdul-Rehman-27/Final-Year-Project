import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { dashboardPath, parseApiError } from "../../utils/errors.js";
import { registerSchema } from "../../utils/validators.js";
import Alert from "../common/Alert.jsx";
import Button from "../common/Button.jsx";
import Input from "../common/Input.jsx";
import PasswordInput from "../common/PasswordInput.jsx";
import Select from "../common/Select.jsx";
import PasswordStrength from "./PasswordStrength.jsx";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Patient self-registration (doctors/admins are created by the administrator). */
export default function RegisterForm() {
  const { t, lang } = useLanguage();
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");

  const schema = useMemo(() => registerSchema(t), [t]);
  const {
    register,
    handleSubmit,
    watch,
    trigger,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      dob: "",
      gender: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const password = watch("password");

  useEffect(() => {
    if (Object.keys(errors).length) trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Re-check "confirm password" whenever the main password changes
  useEffect(() => {
    if (watch("confirmPassword")) trigger("confirmPassword");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  const onSubmit = async (values) => {
    setServerError("");
    try {
      // values are already trimmed / normalised by the zod schema
      const user = await registerUser(values);
      navigate(dashboardPath(user.role), { replace: true });
    } catch (err) {
      const { status, key } = parseApiError(err);
      if (status === 409) setError("email", { type: "server", message: t(key) });
      else setServerError(t(key));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && <Alert>{serverError}</Alert>}

      <Input
        id="reg-name"
        required
        label={t("auth.fields.fullName")}
        autoComplete="name"
        placeholder={t("auth.placeholders.fullName")}
        error={errors.fullName?.message}
        {...register("fullName")}
      />

      <Input
        id="reg-email"
        required
        label={t("auth.fields.email")}
        type="email"
        dir="ltr"
        autoComplete="email"
        placeholder={t("auth.placeholders.email")}
        error={errors.email?.message}
        {...register("email")}
      />

      <Input
        id="reg-phone"
        required
        label={t("auth.fields.phone")}
        type="tel"
        dir="ltr"
        autoComplete="tel"
        inputMode="tel"
        placeholder={t("auth.placeholders.phone")}
        error={errors.phone?.message}
        {...register("phone")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="reg-dob"
        required
          label={t("auth.fields.dob")}
          type="date"
          max={todayISO()}
          autoComplete="bday"
          error={errors.dob?.message}
          {...register("dob")}
        />
        <Select id="reg-gender" required label={t("auth.fields.gender")} error={errors.gender?.message} {...register("gender")}>
          <option value="">{t("auth.gender.select")}</option>
          <option value="male">{t("auth.gender.male")}</option>
          <option value="female">{t("auth.gender.female")}</option>
          <option value="other">{t("auth.gender.other")}</option>
        </Select>
      </div>

      <div>
        <PasswordInput
          id="reg-password"
        required
          label={t("auth.fields.password")}
          autoComplete="new-password"
          placeholder={t("auth.placeholders.newPassword")}
          error={errors.password?.message}
          {...register("password")}
        />
        <PasswordStrength value={password} />
      </div>

      <PasswordInput
        id="reg-confirm"
        required
        label={t("auth.fields.confirmPassword")}
        autoComplete="new-password"
        placeholder={t("auth.placeholders.confirmPassword")}
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-line accent-brand-700"
            aria-invalid={!!errors.acceptTerms}
            {...register("acceptTerms")}
          />
          <span>{t("auth.terms")}</span>
        </label>
        {errors.acceptTerms && (
          <p role="alert" className="mt-1.5 text-sm text-red-600">
            {errors.acceptTerms.message}
          </p>
        )}
      </div>

      <Button type="submit" loading={isSubmitting}>
        {isSubmitting ? t("auth.submitting") : t("auth.submitRegister")}
      </Button>
    </form>
  );
}
