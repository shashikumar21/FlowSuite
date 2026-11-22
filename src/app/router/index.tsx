import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { Route, Routes } from 'react-router-dom'
import { AdminLayout } from '@/app/layouts/AdminLayout'
import { AppLayout } from '@/app/layouts/AppLayout'
import { HomeRedirect, ProtectedRoute, RequireAdmin, RequireTenant } from './guards'

// Route-level code splitting keeps the initial bundle small; each page is
// downloaded only when its route is visited.
const AdminBusinessesPage = lazy(() =>
  import('@/modules/admin/pages/AdminBusinessesPage').then((m) => ({ default: m.AdminBusinessesPage })),
)
const AdminOverviewPage = lazy(() =>
  import('@/modules/admin/pages/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage })),
)
const AdminPlansPage = lazy(() =>
  import('@/modules/admin/pages/AdminPlansPage').then((m) => ({ default: m.AdminPlansPage })),
)
const AiAgentsPage = lazy(() =>
  import('@/modules/ai-console/pages/AiAgentsPage').then((m) => ({ default: m.AiAgentsPage })),
)
const AiConversationsPage = lazy(() =>
  import('@/modules/ai-console/pages/AiConversationsPage').then((m) => ({ default: m.AiConversationsPage })),
)
const IntegrationsPage = lazy(() =>
  import('@/modules/ai-console/pages/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })),
)
const AppointmentsPage = lazy(() =>
  import('@/modules/booking/pages/AppointmentsPage').then((m) => ({ default: m.AppointmentsPage })),
)
const AvailabilityPage = lazy(() =>
  import('@/modules/booking/pages/AvailabilityPage').then((m) => ({ default: m.AvailabilityPage })),
)
const BookingOverviewPage = lazy(() =>
  import('@/modules/booking/pages/BookingOverviewPage').then((m) => ({ default: m.BookingOverviewPage })),
)
const BookingPageSettingsPage = lazy(() =>
  import('@/modules/booking/pages/BookingPageSettingsPage').then((m) => ({ default: m.BookingPageSettingsPage })),
)
const BookingCalendarPage = lazy(() =>
  import('@/modules/booking/pages/BookingCalendarPage').then((m) => ({ default: m.BookingCalendarPage })),
)
const PublicBookingPage = lazy(() =>
  import('@/modules/booking/pages/PublicBookingPage').then((m) => ({ default: m.PublicBookingPage })),
)
const PublicReviewPage = lazy(() =>
  import('@/modules/reviews/pages/PublicReviewPage').then((m) => ({ default: m.PublicReviewPage })),
)
const ResourcesPage = lazy(() =>
  import('@/modules/booking/pages/ResourcesPage').then((m) => ({ default: m.ResourcesPage })),
)
const ServicesPage = lazy(() =>
  import('@/modules/booking/pages/ServicesPage').then((m) => ({ default: m.ServicesPage })),
)
const ForgotPasswordPage = lazy(() =>
  import('@/modules/auth/pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
)
const LoginPage = lazy(() =>
  import('@/modules/auth/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const ResetPasswordPage = lazy(() =>
  import('@/modules/auth/pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)
const SignupPage = lazy(() =>
  import('@/modules/auth/pages/SignupPage').then((m) => ({ default: m.SignupPage })),
)
const ContactsPage = lazy(() =>
  import('@/modules/crm/pages/ContactsPage').then((m) => ({ default: m.ContactsPage })),
)
const CrmOverviewPage = lazy(() =>
  import('@/modules/crm/pages/CrmOverviewPage').then((m) => ({ default: m.CrmOverviewPage })),
)
const CrmSettingsPage = lazy(() =>
  import('@/modules/crm/pages/CrmSettingsPage').then((m) => ({ default: m.CrmSettingsPage })),
)
const DealsPage = lazy(() =>
  import('@/modules/crm/pages/DealsPage').then((m) => ({ default: m.DealsPage })),
)
const ImportHistoryPage = lazy(() =>
  import('@/modules/crm/pages/ImportHistoryPage').then((m) => ({ default: m.ImportHistoryPage })),
)
const DashboardPage = lazy(() =>
  import('@/modules/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const GrowthOverviewPage = lazy(() =>
  import('@/modules/growth/pages/GrowthOverviewPage').then((m) => ({ default: m.GrowthOverviewPage })),
)
const MarketingPage = lazy(() =>
  import('@/modules/growth/pages/MarketingPage').then((m) => ({ default: m.MarketingPage })),
)
const GrowthCampaignsPage = lazy(() =>
  import('@/modules/growth/pages/CampaignsPage').then((m) => ({ default: m.CampaignsPage })),
)
const WebsitesPage = lazy(() =>
  import('@/modules/growth/pages/WebsitesPage').then((m) => ({ default: m.WebsitesPage })),
)
const ReputationPage = lazy(() =>
  import('@/modules/growth/pages/ReputationPage').then((m) => ({ default: m.ReputationPage })),
)
const InboxPage = lazy(() =>
  import('@/modules/inbox/pages/InboxPage').then((m) => ({ default: m.InboxPage })),
)
const NotificationsPage = lazy(() =>
  import('@/modules/notifications/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const ModulePlaceholderPage = lazy(() =>
  import('@/modules/dashboard/pages/ModulePlaceholderPage').then((m) => ({ default: m.ModulePlaceholderPage })),
)
const CreateBusinessPage = lazy(() =>
  import('@/modules/onboarding/pages/CreateBusinessPage').then((m) => ({ default: m.CreateBusinessPage })),
)
const BusinessSettingsPage = lazy(() =>
  import('@/modules/settings/pages/BusinessSettingsPage').then((m) => ({ default: m.BusinessSettingsPage })),
)
const ProfileSettingsPage = lazy(() =>
  import('@/modules/settings/pages/ProfileSettingsPage').then((m) => ({ default: m.ProfileSettingsPage })),
)
const SalesAgentOverviewPage = lazy(() =>
  import('@/modules/sales-agent/pages/SalesAgentOverviewPage').then((m) => ({ default: m.SalesAgentOverviewPage })),
)
const ProspectDiscoveryPage = lazy(() =>
  import('@/modules/sales-agent/pages/ProspectDiscoveryPage').then((m) => ({ default: m.ProspectDiscoveryPage })),
)
const ProspectsPage = lazy(() =>
  import('@/modules/sales-agent/pages/ProspectsPage').then((m) => ({ default: m.ProspectsPage })),
)
const CampaignsPage = lazy(() =>
  import('@/modules/sales-agent/outreach/pages/CampaignsPage').then((m) => ({ default: m.CampaignsPage })),
)
const EmailWriterPage = lazy(() =>
  import('@/modules/sales-agent/outreach/pages/EmailWriterPage').then((m) => ({ default: m.EmailWriterPage })),
)
const ApprovalsPage = lazy(() =>
  import('@/modules/sales-agent/outreach/pages/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage })),
)
const SendingPage = lazy(() =>
  import('@/modules/sales-agent/outreach/pages/SendingPage').then((m) => ({ default: m.SendingPage })),
)
const DecisionMakersPage = lazy(() =>
  import('@/modules/sales-agent/contacts/pages/DecisionMakersPage').then((m) => ({ default: m.DecisionMakersPage })),
)
const RepliesPage = lazy(() =>
  import('@/modules/sales-agent/contacts/pages/RepliesPage').then((m) => ({ default: m.RepliesPage })),
)
const AcceptInvitationPage = lazy(() =>
  import('@/modules/team/pages/AcceptInvitationPage').then((m) => ({ default: m.AcceptInvitationPage })),
)
const TeamPage = lazy(() =>
  import('@/modules/team/pages/TeamPage').then((m) => ({ default: m.TeamPage })),
)
const TasksPage = lazy(() =>
  import('@/modules/tasks/pages/TasksPage').then((m) => ({ default: m.TasksPage })),
)
const PaymentsPage = lazy(() =>
  import('@/modules/payments/pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })),
)
const WorkflowsPage = lazy(() =>
  import('@/modules/workflows/pages/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })),
)
const VoiceAgentPage = lazy(() =>
  import('@/modules/voice-agent/pages/VoiceAgentPage').then((m) => ({ default: m.VoiceAgentPage })),
)
const NotFoundPage = lazy(() =>
  import('@/app/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)

function RouteLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-ink-50">
      <Loader2 className="size-7 animate-spin text-brand-600" />
    </div>
  )
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/invite/:token" element={<AcceptInvitationPage />} />
        {/* Anonymous, slug-scoped booking page. All validation happens server-side. */}
        <Route path="/book/:slug" element={<PublicBookingPage />} />
        <Route path="/r/:token" element={<PublicReviewPage />} />

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
            <Route path="booking/calendar" element={<BookingCalendarPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="ai/agents" element={<AiAgentsPage />} />
            <Route path="ai/conversations" element={<AiConversationsPage />} />
            <Route path="voice-agent" element={<VoiceAgentPage />} />
            <Route path="sales-agent" element={<SalesAgentOverviewPage />} />
            <Route path="sales-agent/discovery" element={<ProspectDiscoveryPage />} />
            <Route path="sales-agent/prospects" element={<ProspectsPage />} />
            <Route path="sales-agent/campaigns" element={<CampaignsPage />} />
            <Route path="sales-agent/email-writer" element={<EmailWriterPage />} />
            <Route path="sales-agent/approvals" element={<ApprovalsPage />} />
            <Route path="sales-agent/sending" element={<SendingPage />} />
            <Route path="sales-agent/decision-makers" element={<DecisionMakersPage />} />
            <Route path="sales-agent/replies" element={<RepliesPage />} />
            <Route path="growth" element={<GrowthOverviewPage />} />
            <Route path="growth/marketing" element={<MarketingPage />} />
            <Route path="growth/campaigns" element={<GrowthCampaignsPage />} />
            <Route path="growth/websites" element={<WebsitesPage />} />
            <Route path="growth/reputation" element={<ReputationPage />} />
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
    </Suspense>
  )
}
