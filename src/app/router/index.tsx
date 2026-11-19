import { Route, Routes } from 'react-router-dom'
import { AdminLayout } from '@/app/layouts/AdminLayout'
import { AppLayout } from '@/app/layouts/AppLayout'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { AdminBusinessesPage } from '@/modules/admin/pages/AdminBusinessesPage'
import { AdminOverviewPage } from '@/modules/admin/pages/AdminOverviewPage'
import { AdminPlansPage } from '@/modules/admin/pages/AdminPlansPage'
import { ForgotPasswordPage } from '@/modules/auth/pages/ForgotPasswordPage'
import { LoginPage } from '@/modules/auth/pages/LoginPage'
import { ResetPasswordPage } from '@/modules/auth/pages/ResetPasswordPage'
import { SignupPage } from '@/modules/auth/pages/SignupPage'
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage'
import { ModulePlaceholderPage } from '@/modules/dashboard/pages/ModulePlaceholderPage'
import { CreateBusinessPage } from '@/modules/onboarding/pages/CreateBusinessPage'
import { BusinessSettingsPage } from '@/modules/settings/pages/BusinessSettingsPage'
import { ProfileSettingsPage } from '@/modules/settings/pages/ProfileSettingsPage'
import { AcceptInvitationPage } from '@/modules/team/pages/AcceptInvitationPage'
import { TeamPage } from '@/modules/team/pages/TeamPage'
import { HomeRedirect, ProtectedRoute, RequireAdmin, RequireTenant } from './guards'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/invite/:token" element={<AcceptInvitationPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<HomeRedirect />} />

        <Route element={<RequireTenant />}>
          <Route path="/onboarding/business" element={<CreateBusinessPage />} />
        </Route>

        <Route path="/app" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="settings/business" element={<BusinessSettingsPage />} />
          <Route path="settings/profile" element={<ProfileSettingsPage />} />
          <Route path="module/:moduleKey" element={<ModulePlaceholderPage />} />
        </Route>

        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="businesses" element={<AdminBusinessesPage />} />
            <Route path="plans" element={<AdminPlansPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
