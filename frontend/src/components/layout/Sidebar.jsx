import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import Logo from "../common/Logo.jsx";

/** Logo + navigation links + logout. `items` = [{ to, labelKey, end? }]. */
export default function Sidebar({ items, onNavigate }) {
  const { t } = useLanguage();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav className="flex h-full flex-col p-5" aria-label="Main">
      <div className="mb-8 px-2">
        <Logo name={t("brand")} />
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `block rounded-xl px-4 py-3 text-lg font-bold transition-colors ${
                  isActive ? "bg-brand-tint text-brand-700" : "text-ink-muted hover:bg-brand-50"
                }`
              }
            >
              {t(item.labelKey)}
            </NavLink>
          </li>
        ))}
      </ul>

      <button onClick={onLogout} className="mt-auto rounded-xl px-4 py-3 text-start font-bold text-ink-muted hover:bg-brand-50">
        {t("dashboards.logout")}
      </button>
    </nav>
  );
}
