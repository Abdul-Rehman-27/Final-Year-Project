import { useState } from "react";
import { Outlet } from "react-router-dom";
import { PATIENT_NAV } from "../../config/patientNav.js";
import NotificationBell from "./NotificationBell.jsx";
import PatientSidebar from "./PatientSidebar.jsx";

export default function PatientLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <div className="min-h-screen bg-surface font-portal text-[15px] text-ink lg:flex">
      <aside className="hidden w-[244px] shrink-0 border-e border-line bg-white lg:sticky lg:top-0 lg:block lg:h-screen"><PatientSidebar items={PATIENT_NAV} /></aside>
      {menuOpen && <div className="fixed inset-0 z-40 lg:hidden"><button type="button" className="absolute inset-0 cursor-default bg-black/40" onClick={closeMenu} aria-label="Close menu" /><aside className="absolute inset-y-0 start-0 w-[244px] bg-white"><PatientSidebar items={PATIENT_NAV} onNavigate={closeMenu} /></aside></div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between px-4 pt-4 lg:hidden"><button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-600"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button><NotificationBell /></div>
        <main className="min-w-0 px-4 pb-10 pt-7 lg:px-9"><div className="mx-auto max-w-[1120px]"><div className="mb-3 hidden justify-end lg:flex"><NotificationBell /></div><Outlet /></div></main>
      </div>
    </div>
  );
}
