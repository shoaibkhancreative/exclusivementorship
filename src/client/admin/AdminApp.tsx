import { Navigate, Route, Routes } from "react-router-dom";
import { AdminSessionProvider, useAdminSession } from "./lib/AdminSessionContext";
import { LoadingScreen } from "../components/ui";
import AdminLogin from "./pages/AdminLogin";
import AdminLayout from "./pages/AdminLayout";
import DashboardPage from "./pages/DashboardPage";
import StudentsPage from "./pages/StudentsPage";
import LessonsPage from "./pages/LessonsPage";
import SupportPage from "./pages/SupportPage";
import ContentPage from "./pages/ContentPage";
import SectionsPage from "./pages/SectionsPage";
import SettingsPage from "./pages/SettingsPage";
import AnalyticsPage from "./pages/AnalyticsPage";

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { admin, loading } = useAdminSession();
  if (loading) return <LoadingScreen />;
  if (!admin?.authenticated) return <Navigate to="/admin/login" replace />;
  return children;
}

/**
 * Completely separate app tree from the student-facing App.tsx: its own
 * session provider (AdminSessionProvider, reading /api/admin/me — the
 * em_admin_session cookie), no TopBar, no SupportButton, no student
 * SessionProvider anywhere in this tree.
 */
export default function AdminApp() {
  return (
    <AdminSessionProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="lessons" element={<LessonsPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="sections" element={<SectionsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </AdminSessionProvider>
  );
}
