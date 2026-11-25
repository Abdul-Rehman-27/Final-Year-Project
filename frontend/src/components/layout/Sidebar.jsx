import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import Logo from "../common/Logo.jsx";
import Avatar from "../common/Avatar.jsx";
import { NAV_ICONS } from "./navIcons.jsx";

/** Logo + navigation links + logout. `items` = [{ to, labelKey, end? }]. */
export default function Sidebar({ items, onNavigate, portalLabel, userCard }) {
  const { t } = useLanguage();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav className="flex h-full flex-col p-5" aria-label="Main">
      <div className="mb-8 px-2">
        <Logo name={t("brand")} />
        {portalLabel && <p className="mt-2 text-xs font-bold uppercase tracking-[.08em] text-ink-muted">{portalLabel}</p>}
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) => {
                const active = isActive || item.matchPaths?.some((path) => location.pathname.startsWith(path));
                return `flex items-center gap-3 rounded-xl px-4 py-3 ${item.icon ? "text-base" : "text-lg"} font-bold transition-colors ${
                  active ? "bg-brand-tint text-brand-700" : "text-ink-muted hover:bg-brand-50"
                }`
              }}
            >
              {item.icon && NAV_ICONS[item.icon]}
              {t(item.labelKey)}
            </NavLink>
          </li>
        ))}
      </ul>

      {userCard ? (
        <div className="mt-2 flex shrink-0 items-center gap-3 border-t border-line pt-4">
          <Avatar name={userCard.name} size="sm" />
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{userCard.name}</p><p className="truncate text-sm text-ink-muted">{userCard.subtitle}</p></div>
          <button onClick={onLogout} aria-label={t("dashboards.logout")} className="rounded-xl border border-line p-2 text-ink-muted hover:bg-brand-50"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg></button>
        </div>
      ) : (
        <button onClick={onLogout} className="mt-2 shrink-0 rounded-xl px-4 py-3 text-start font-bold text-ink-muted hover:bg-brand-50">{t("dashboards.logout")}</button>
      )}
    </nav>
  );
}
