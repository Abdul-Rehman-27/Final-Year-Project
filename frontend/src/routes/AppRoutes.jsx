import { Navigate, Route, Routes } from "react-router-dom";

import DashboardLayout from "../components/layout/DashboardLayout.jsx";
import { ADMIN_NAV } from "../config/adminNav.js";
import AdminDepartments from "../pages/admin/AdminDepartments.jsx";
import AdminEvaluation from "../pages/admin/AdminEvaluation.jsx";
import AdminKnowledgeBase from "../pages/admin/AdminKnowledgeBase.jsx";
import AdminOverview from "../pages/admin/AdminOverview.jsx";
import AdminPermissions from "../pages/admin/AdminPermissions.jsx";
import AdminRoles from "../pages/admin/AdminRoles.jsx";
import AdminStaff from "../pages/admin/AdminStaff.jsx";
import AuthPage from "../pages/auth/AuthPage.jsx";
import ComingSoon from "../pages/ComingSoon.jsx";
import DashboardPlaceholder from "../pages/dashboards/DashboardPlaceholder.jsx";
import PatientChat from "../pages/dashboards/PatientChat.jsx";
import NotFound from "../pages/NotFound.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route path="/patient" element={<ProtectedRoute role="patient"><PatientChat /></ProtectedRoute>} />
      <Route path="/doctor" element={<ProtectedRoute role="doctor"><DashboardPlaceholder role="doctor" /></ProtectedRoute>} />

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
        <Route path="departments" element={<AdminDepartments />} />
        <Route path="roles" element={<AdminRoles />} />
        <Route path="permissions" element={<AdminPermissions />} />
        <Route path="evaluation" element={<AdminEvaluation />} />
        <Route path="knowledge-base" element={<AdminKnowledgeBase />} />
        <Route path="audit-logs" element={<ComingSoon titleKey="admin.nav.auditLogs" />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
