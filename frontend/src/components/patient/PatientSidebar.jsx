import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { PATIENT } from "../../data/mockPatient.js";
import Avatar from "../common/Avatar.jsx";
import PatientLogo from "./PatientLogo.jsx";

function NavIcon({ icon }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
    assistant: <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" />,
    appointments: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    prescriptions: <path d="M8 3h6a4 4 0 0 1 0 8H8zM8 3v18M12 11l6 10" />,
    labs: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />,
  };
  return <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[icon]}</svg>;
}

function patientAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birthday = new Date(dateOfBirth);
  if (Number.isNaN(birthday.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  if (today < new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate())) age -= 1;
  return age;
}

/** Props: `items` defines nav items and `onNavigate` closes the mobile drawer. */
export default function PatientSidebar({ items, onNavigate }) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const name = user?.full_name || PATIENT.name;
  const age = patientAge(user?.date_of_birth);

  return (
    <nav className="flex h-full flex-col gap-1 px-4 py-6" aria-label="Patient portal">
      <div className="mb-7 mx-2"><PatientLogo /></div>
      <ul className="space-y-1">
        {items.map((item) => <li key={item.to}><NavLink to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => `flex min-h-[46px] items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600 ${isActive ? "bg-brand-tint font-bold text-brand-deep" : "text-ink-soft hover:bg-brand-50"}`}><NavIcon icon={item.icon} />{t(item.labelKey)}</NavLink></li>)}
      </ul>
      <div className="mt-auto flex items-center gap-2.5 border-t border-line p-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-bold text-ink">{name}</p><p className="text-[13px] text-ink-soft">{t("patient.role")}{age !== null ? ` · ${age} y` : ""}</p></div>
        <button type="button" aria-label={t("patient.logout")} onClick={() => { logout(); navigate("/login", { replace: true }); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-soft hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-600"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></svg></button>
      </div>
    </nav>
  );
}
