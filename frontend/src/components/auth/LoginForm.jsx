import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext.jsx";
import { authService } from "../../services/authService.js";
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
  const [resetStep, setResetStep] = useState("request");
  const [challengeId, setChallengeId] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const schema = useMemo(() => loginSchema(t), [t]);
  const {
    register,
    handleSubmit,
    trigger,
    getValues,
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

  const requestCode = async () => {
    setResetError("");
    setResetMessage("");
    const validEmail = await trigger("email");
    if (!validEmail) return;
    setResetBusy(true);
    try {
      const result = await authService.requestPasswordReset(getValues("email").trim(), role);
      setChallengeId(result.challenge_id);
      setResetStep("verify");
      setResetMessage(t("auth.reset.sent"));
    } catch (err) {
      setResetError(err.response?.data?.detail || t("auth.errors.generic"));
    } finally {
      setResetBusy(false);
    }
  };

  const submitReset = async () => {
    setResetError("");
    setResetMessage("");
    if (!/^\d{6}$/.test(resetCode)) return setResetError(t("auth.reset.codeInvalid"));
    if (newPassword.length < 8 || newPassword.length > 64 || /\s/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9\s]/.test(newPassword)) return setResetError(t("auth.reset.passwordRules"));
    if (newPassword !== confirmPassword) return setResetError(t("validation.passwordMatch"));
    setResetBusy(true);
    try {
      await authService.confirmPasswordReset(challengeId, resetCode, newPassword);
      setResetStep("request");
      setShowForgot(false);
      setServerError("");
      setResetSuccess(t("auth.reset.success"));
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setResetError(err.response?.data?.detail || t("auth.errors.generic"));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && <Alert>{serverError}</Alert>}
      {resetSuccess && <Alert type="info">{resetSuccess}</Alert>}

      {!showForgot && <><Input
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
        {role !== "doctor" && <div className="mt-2 text-end">
          <button type="button" onClick={() => { setShowForgot(true); setResetSuccess(""); setResetStep("request"); setResetMessage(""); setResetError(""); }} className="text-sm font-bold text-brand-700 hover:underline">
            {t("auth.forgot")}
          </button>
        </div>}
      </div></>}

      {showForgot && (
          <div className="mt-3 space-y-3">
            {resetMessage && <Alert type="info">{resetMessage}</Alert>}
            {resetError && <Alert>{resetError}</Alert>}
            {resetStep === "request" ? (
              <Button type="button" variant="secondary" size="sm" loading={resetBusy} onClick={requestCode}>
                {resetBusy ? t("auth.submitting") : t("auth.reset.sendCode")}
              </Button>
            ) : (
              <div className="space-y-3">
                <Input id="reset-code" label={t("auth.reset.code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                <PasswordInput id="reset-new-password" label={t("auth.reset.newPassword")} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <PasswordInput id="reset-confirm-password" label={t("auth.fields.confirmPassword")} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                <Button type="button" loading={resetBusy} onClick={submitReset}>{resetBusy ? t("auth.submitting") : t("auth.reset.updatePassword")}</Button>
              </div>
            )}
            <button type="button" onClick={() => { setShowForgot(false); setResetStep("request"); setResetError(""); setResetMessage(""); }} className="block w-full text-center text-sm font-bold text-brand-700 hover:underline">
              {t("auth.reset.backToLogin")}
            </button>
          </div>
      )}

      {!showForgot && <Button type="submit" loading={isSubmitting}>{isSubmitting ? t("auth.submitting") : t("auth.submitLogin")}</Button>}

      {role !== "patient" && <p className="text-center text-sm text-ink-muted">{t("auth.staffNote")}</p>}
    </form>
  );
}
