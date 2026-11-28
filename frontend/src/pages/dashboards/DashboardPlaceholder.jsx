import { useNavigate } from "react-router-dom";
import LanguageSwitch from "../../components/common/LanguageSwitch.jsx";
import Logo from "../../components/common/Logo.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

/** Temporary landing page per role - replaced by real dashboards in the next screens. */
export default function DashboardPlaceholder({ role }) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <Logo name={t("brand")} />
        <div className="flex items-center gap-4">
          <LanguageSwitch />
          <button onClick={onLogout} className="rounded-xl border border-line px-4 py-2 text-sm font-bold hover:bg-brand-50">
            {t("dashboards.logout")}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-black">
          {t("dashboards.welcome")}, {user?.full_name}
        </h1>
        <p className="mt-1 font-bold uppercase tracking-wide text-brand-700">{t(`auth.roles.${role}`)}</p>
        <p className="mt-6 rounded-xl border border-line bg-white p-6 text-ink-muted">{t("dashboards.placeholder")}</p>
      </main>
    </div>
  );
}
