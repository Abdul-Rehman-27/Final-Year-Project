import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { parseApiError, dashboardPath } from "../../utils/errors.js";
import { loginSchema } from "../../utils/validators.js";
import Alert from "../common/Alert.jsx";
import Button from "../common/Button.jsx";
import Input from "../common/Input.jsx";
import PasswordInput from "../common/PasswordInput.jsx";

export default function LoginForm({ role }) {
  const { t, lang } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  const schema = useMemo(() => loginSchema(t), [t]);
  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { email: "", password: "" },
  });

  // Re-validate visible errors when the language changes so messages are translated
  useEffect(() => {
    if (Object.keys(errors).length) trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Clear a stale server error when the user switches role
  useEffect(() => setServerError(""), [role]);

  const onSubmit = async (values) => {
    setServerError("");
    try {
      const user = await login({ ...values, role });
      navigate(dashboardPath(user.role), { replace: true });
    } catch (err) {
      setServerError(t(parseApiError(err).key));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && <Alert>{serverError}</Alert>}

      <Input
        id="login-email"
        required
        label={t("auth.fields.email")}
        type="email"
        dir="ltr"
        autoComplete="email"
        placeholder={t("auth.placeholders.email")}
        error={errors.email?.message}
        {...register("email")}
      />

      <div>
        <PasswordInput
          id="login-password"
          required
          label={t("auth.fields.password")}
          autoComplete="current-password"
          placeholder={t("auth.placeholders.password")}
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="mt-2 text-end">
          <button
            type="button"
            onClick={() => setShowForgot((v) => !v)}
            className="text-sm font-bold text-brand-700 hover:underline"
          >
            {t("auth.forgot")}
          </button>
        </div>
        {showForgot && (
          <div className="mt-2">
            <Alert type="info">{t("auth.forgotSoon")}</Alert>
          </div>
        )}
      </div>

      <Button type="submit" loading={isSubmitting}>
        {isSubmitting ? t("auth.submitting") : t("auth.submitLogin")}
      </Button>

      {role !== "patient" && <p className="text-center text-sm text-ink-muted">{t("auth.staffNote")}</p>}
    </form>
  );
}
