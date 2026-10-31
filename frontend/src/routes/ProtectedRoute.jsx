import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { dashboardPath } from "../utils/errors.js";

/** Only lets `role` through. Logged-out users go to /login, wrong role goes to their own dashboard. */
export default function ProtectedRoute({ role, children }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={dashboardPath(user.role)} replace />;
  return children;
}
