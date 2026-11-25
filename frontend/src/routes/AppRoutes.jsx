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
import NotFound from "../pages/NotFound.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import DoctorShell from "../components/doctor/DoctorShell.jsx";
import DoctorDashboard from "../pages/doctor/DoctorDashboard.jsx";
import DoctorAvailability from "../pages/doctor/DoctorAvailability.jsx";
import DoctorQueue from "../pages/doctor/DoctorQueue.jsx";
import DoctorAppointment from "../pages/doctor/DoctorAppointment.jsx";
import DoctorSummary from "../pages/doctor/DoctorSummary.jsx";
import DoctorWritePrescription from "../pages/doctor/DoctorWritePrescription.jsx";
import DoctorPrescriptions from "../pages/doctor/DoctorPrescriptions.jsx";
import DoctorPatients from "../pages/doctor/DoctorPatients.jsx";
import DoctorPatientProfile from "../pages/doctor/DoctorPatientProfile.jsx";
import DoctorLabTests from "../pages/doctor/DoctorLabTests.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route path="/patient" element={<ProtectedRoute role="patient"><PatientChat /></ProtectedRoute>} />
      <Route path="/doctor" element={<ProtectedRoute role="doctor"><DoctorShell /></ProtectedRoute>}>
        <Route index element={<DoctorDashboard />} />
        <Route path="availability" element={<DoctorAvailability />} />
        <Route path="queue" element={<DoctorQueue />} />
        <Route path="queue/:appointmentId" element={<DoctorAppointment />} />
        <Route path="queue/:appointmentId/summary" element={<DoctorSummary />} />
        <Route path="queue/:appointmentId/prescription/new" element={<DoctorWritePrescription />} />
        <Route path="prescriptions" element={<DoctorPrescriptions />} />
        <Route path="patients" element={<DoctorPatients />} />
        <Route path="patients/:patientId" element={<DoctorPatientProfile />} />
        <Route path="patients/:patientId/summary" element={<DoctorSummary />} />
        <Route path="lab-tests" element={<DoctorLabTests />} />
      </Route>

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
