import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import AuthTabs from "../../components/auth/AuthTabs.jsx";
import LoginForm from "../../components/auth/LoginForm.jsx";
import RegisterForm from "../../components/auth/RegisterForm.jsx";
import RoleSelector from "../../components/auth/RoleSelector.jsx";
import LanguageSwitch from "../../components/common/LanguageSwitch.jsx";
import Logo from "../../components/common/Logo.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { dashboardPath } from "../../utils/errors.js";

/** Screen 1 - Login and Register. `mode` comes from the route (/login or /register). */
export default function AuthPage({ mode }) {
  const { t } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState("patient");

  const canRegister = role === "patient";

  // Only patients can register: if a staff role is picked on /register, go to /login
  useEffect(() => {
    if (mode === "register" && !canRegister) navigate("/login", { replace: true });
  }, [mode, canRegister, navigate]);

  if (isAuthenticated && user) return <Navigate to={dashboardPath(user.role)} replace />;

  const isRegister = mode === "register";

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: brand panel (hidden on small screens) */}
      <aside className="hidden flex-col justify-between bg-brand-700 p-12 text-white lg:flex">
        <Logo name={t("brand")} light />
        <div>
          <h1 className="text-5xl font-black leading-tight">
            {t(isRegister ? "auth.welcome.registerTitle" : "auth.welcome.title")}
          </h1>
          <p className="mt-4 max-w-md text-lg text-white/85">
            {t(isRegister ? "auth.welcome.registerSubtitle" : "auth.welcome.subtitle")}
          </p>
        </div>
        <p className="text-sm text-white/75">{t("brandFooter")}</p>
      </aside>

      {/* Right: form */}
      <main className="flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between">
          <div className="lg:invisible">
            <Logo name={t("brand")} />
          </div>
          <LanguageSwitch />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-8">
          <RoleSelector value={role} onChange={setRole} />
          <AuthTabs
            mode={mode}
            showRegister={canRegister}
            onChange={(next) => navigate(next === "register" ? "/register" : "/login")}
          />
          {isRegister ? <RegisterForm /> : <LoginForm role={role} />}
        </div>
      </main>
    </div>
  );
}
