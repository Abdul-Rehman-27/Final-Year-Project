import { Navigate, Route, Routes } from "react-router-dom";

import DashboardLayout from "../components/layout/DashboardLayout.jsx";
import { ADMIN_NAV } from "../config/adminNav.js";
import AdminOverview from "../pages/admin/AdminOverview.jsx";
import AdminStaff from "../pages/admin/AdminStaff.jsx";
import AuthPage from "../pages/auth/AuthPage.jsx";
import ComingSoon from "../pages/ComingSoon.jsx";
import DashboardPlaceholder from "../pages/dashboards/DashboardPlaceholder.jsx";
import NotFound from "../pages/NotFound.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";

// Roles that still use the temporary placeholder dashboard
const PLACEHOLDER_ROLES = ["patient", "doctor"];

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      {PLACEHOLDER_ROLES.map((role) => (
        <Route
          key={role}
          path={`/${role}`}
          element={
            <ProtectedRoute role={role}>
              <DashboardPlaceholder role={role} />
            </ProtectedRoute>
          }
        />
      ))}

      {/* Admin portal: sidebar layout + nested pages */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout navItems={ADMIN_NAV} />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminOverview />} />
        <Route path="staff" element={<AdminStaff />} />
        <Route path="knowledge-base" element={<ComingSoon titleKey="admin.nav.knowledgeBase" />} />
        <Route path="audit-logs" element={<ComingSoon titleKey="admin.nav.auditLogs" />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
