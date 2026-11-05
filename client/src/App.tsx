import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAdmin, RequireLoggedOut, RequireLogin, RequireOrg } from "./components/Guards";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StartPage } from "./pages/StartPage";
import { TodayPage } from "./pages/TodayPage";
import { UpcomingPage } from "./pages/UpcomingPage";
import { BoardPage } from "./pages/admin/BoardPage";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { MembersPage } from "./pages/admin/MembersPage";
import { PreviewPage } from "./pages/admin/PreviewPage";
import { RuleFormPage } from "./pages/admin/RuleFormPage";
import { RulesPage } from "./pages/admin/RulesPage";

export function App() {
  return (
    <>
      <Routes>
        <Route element={<RequireLoggedOut />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<RequireLogin />}>
          <Route path="/start" element={<StartPage />} />

          <Route element={<RequireOrg />}>
            <Route element={<Layout />}>
              <Route path="/" element={<TodayPage />} />
              <Route path="/upcoming" element={<UpcomingPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />

              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<DashboardPage />} />
                <Route path="/admin/members" element={<MembersPage />} />
                <Route path="/admin/rules" element={<RulesPage />} />
                <Route path="/admin/rules/new" element={<RuleFormPage />} />
                <Route path="/admin/rules/:id" element={<RuleFormPage />} />
                <Route path="/admin/preview" element={<PreviewPage />} />
                <Route path="/admin/board" element={<BoardPage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
