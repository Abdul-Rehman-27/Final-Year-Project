import { useState } from "react";
import { Outlet } from "react-router-dom";
import LanguageSwitch from "../common/LanguageSwitch.jsx";
import Sidebar from "./Sidebar.jsx";

/**
 * Shared shell for every role's dashboard: sidebar + language switch + page content.
 * Pass the role's menu as `navItems`; child routes render inside <Outlet />.
 */
export default function DashboardLayout({ navItems }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen bg-surface lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-e border-line bg-white lg:sticky lg:top-0 lg:block lg:h-screen">
        <Sidebar items={navItems} />
      </aside>

      {/* Mobile sidebar (slides over the page) */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={closeMenu} aria-hidden="true" />
          <aside className="absolute inset-y-0 start-0 w-64 bg-white">
            <Sidebar items={navItems} onNavigate={closeMenu} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between px-4 py-4 sm:px-8">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg border border-line bg-white p-2 lg:invisible"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <LanguageSwitch />
        </div>

        <main className="px-4 pb-10 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
