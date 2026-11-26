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
import AdminAuditLogs from "../pages/admin/AdminAuditLogs.jsx";
import AuthPage from "../pages/auth/AuthPage.jsx";
import DashboardPlaceholder from "../pages/dashboards/DashboardPlaceholder.jsx";
import PatientChat from "../pages/dashboards/PatientChat.jsx";
import PatientLayout from "../components/patient/PatientLayout.jsx";
import PatientDashboard from "../pages/patient/PatientDashboard.jsx";
import PatientAppointments from "../pages/patient/PatientAppointments.jsx";
import PatientPrescriptions from "../pages/patient/PatientPrescriptions.jsx";
import PatientLabReports from "../pages/patient/PatientLabReports.jsx";
import TokenPage from "../pages/patient/print/TokenPage.jsx";
import PrescriptionPage from "../pages/patient/print/PrescriptionPage.jsx";
import RadiologyReportPage from "../pages/patient/print/RadiologyReportPage.jsx";
import LabReportPage from "../pages/patient/print/LabReportPage.jsx";
import PatientStubPage from "../pages/patient/PatientStubPage.jsx";
import NotFound from "../pages/NotFound.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route
        path="/patient"
        element={<ProtectedRoute role="patient"><PatientLayout /></ProtectedRoute>}
      >
        <Route index element={<PatientDashboard />} />
        <Route path="assistant" element={<PatientStubPage titleKey="patient.nav.assistant" />} />
        <Route path="appointments" element={<PatientAppointments />} />
        <Route path="prescriptions" element={<PatientPrescriptions />} />
        <Route path="lab-reports" element={<PatientLabReports />} />
      </Route>
      <Route path="/doctor" element={<ProtectedRoute role="doctor"><DashboardPlaceholder role="doctor" /></ProtectedRoute>} />
      <Route path="/patient/print/token" element={<ProtectedRoute role="patient"><TokenPage /></ProtectedRoute>} />
      <Route path="/patient/print/prescription" element={<ProtectedRoute role="patient"><PrescriptionPage /></ProtectedRoute>} />
      <Route path="/patient/print/radiology-report" element={<ProtectedRoute role="patient"><RadiologyReportPage /></ProtectedRoute>} />
      <Route path="/patient/print/lab-report" element={<ProtectedRoute role="patient"><LabReportPage /></ProtectedRoute>} />

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
        <Route path="audit-logs" element={<AdminAuditLogs />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
