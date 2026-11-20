import { Route, Routes } from 'react-router-dom'
import { AdminLayout } from '@/app/layouts/AdminLayout'
import { AppLayout } from '@/app/layouts/AppLayout'
import { NotFoundPage } from '@/app/pages/NotFoundPage'
import { AdminBusinessesPage } from '@/modules/admin/pages/AdminBusinessesPage'
import { AdminOverviewPage } from '@/modules/admin/pages/AdminOverviewPage'
import { AdminPlansPage } from '@/modules/admin/pages/AdminPlansPage'
import { AiAgentsPage } from '@/modules/ai-console/pages/AiAgentsPage'
import { AiConversationsPage } from '@/modules/ai-console/pages/AiConversationsPage'
import { IntegrationsPage } from '@/modules/ai-console/pages/IntegrationsPage'
import { AppointmentsPage } from '@/modules/booking/pages/AppointmentsPage'
import { AvailabilityPage } from '@/modules/booking/pages/AvailabilityPage'
import { BookingOverviewPage } from '@/modules/booking/pages/BookingOverviewPage'
import { BookingPageSettingsPage } from '@/modules/booking/pages/BookingPageSettingsPage'
import { PublicBookingPage } from '@/modules/booking/pages/PublicBookingPage'
import { ResourcesPage } from '@/modules/booking/pages/ResourcesPage'
import { ServicesPage } from '@/modules/booking/pages/ServicesPage'
import { ForgotPasswordPage } from '@/modules/auth/pages/ForgotPasswordPage'
import { LoginPage } from '@/modules/auth/pages/LoginPage'
import { ResetPasswordPage } from '@/modules/auth/pages/ResetPasswordPage'
import { SignupPage } from '@/modules/auth/pages/SignupPage'
import { ContactsPage } from '@/modules/crm/pages/ContactsPage'
import { CrmOverviewPage } from '@/modules/crm/pages/CrmOverviewPage'
import { CrmSettingsPage } from '@/modules/crm/pages/CrmSettingsPage'
import { DealsPage } from '@/modules/crm/pages/DealsPage'
import { ImportHistoryPage } from '@/modules/crm/pages/ImportHistoryPage'
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage'
import { InboxPage } from '@/modules/inbox/pages/InboxPage'
import { NotificationsPage } from '@/modules/notifications/pages/NotificationsPage'
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
      {/* Anonymous, slug-scoped booking page. All validation happens server-side. */}
      <Route path="/book/:slug" element={<PublicBookingPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<HomeRedirect />} />

        <Route element={<RequireTenant />}>
          <Route path="/onboarding/business" element={<CreateBusinessPage />} />
        </Route>

        <Route path="/app" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="crm" element={<CrmOverviewPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="deals" element={<DealsPage />} />
          <Route path="crm/settings" element={<CrmSettingsPage />} />
          <Route path="crm/imports" element={<ImportHistoryPage />} />
          <Route path="conversations" element={<InboxPage />} />
          <Route path="booking" element={<BookingOverviewPage />} />
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="booking/services" element={<ServicesPage />} />
          <Route path="booking/availability" element={<AvailabilityPage />} />
          <Route path="booking/resources" element={<ResourcesPage />} />
          <Route path="booking/page" element={<BookingPageSettingsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="ai/agents" element={<AiAgentsPage />} />
          <Route path="ai/conversations" element={<AiConversationsPage />} />
          <Route path="settings/business" element={<BusinessSettingsPage />} />
          <Route path="settings/integrations" element={<IntegrationsPage />} />
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
