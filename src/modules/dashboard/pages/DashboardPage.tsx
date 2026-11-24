import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  MessageSquare,
  Sparkles,
  Target,
  UserPlus,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { requireSupabase } from '@/integrations/supabase/client'
import { formatCurrency, formatNumber } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { DashboardCharts } from '../components/DashboardCharts'
import {
  dashboardBookingSnapshotSchema,
  dashboardCrmSnapshotSchema,
  dashboardInboxSnapshotSchema,
  type DashboardLeadSource,
  type DashboardPipelineStage,
} from '../schemas'
import type { ContactRow } from '@/types/database'

type DashboardData = {
  contacts: number
  upcomingAppointments: number
  openConversations: number
  openDeals: number
  dealValue: number
  teamSize: number
  recentContacts: ContactRow[]
  planName: string | null
  subscriptionStatus: string | null
  planFeatures: Record<string, boolean>
  leadSources: DashboardLeadSource[]
  pipelineStages: DashboardPipelineStage[]
}

export function DashboardPage() {
  const { activeTenant, activeRole } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const currency = activeTenant?.businesses?.currency ?? 'INR'

  const query = useQuery({
    queryKey: ['dashboard', tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<DashboardData> => {
      const supabase = requireSupabase()
      const id = tenantId as string
      const [metrics, bookingMetrics, inboxMetrics, recent, members, subscription] = await Promise.all([
        // Trusted RPCs: the same tenant-scoped figures used by each module.
        supabase.rpc('crm_dashboard_metrics', { p_tenant: id }),
        supabase.rpc('booking_dashboard_metrics', { p_tenant: id }),
        supabase.rpc('inbox_metrics', { p_tenant: id }),
        supabase.from('contacts').select('*').eq('tenant_id', id).order('created_at', { ascending: false }).limit(5).returns<ContactRow[]>(),
        supabase.from('business_members').select('id', { count: 'exact', head: true }).eq('tenant_id', id).eq('status', 'active'),
        supabase
          .from('subscriptions')
          .select('status, plans(name, features)')
          .eq('tenant_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .returns<Array<{ status: string; plans: { name: string; features: Record<string, boolean> } | null }>>(),
      ])

      const firstError = [metrics, bookingMetrics, inboxMetrics, recent, members, subscription].find(
        (result) => result.error,
      )?.error
      if (firstError) throw firstError

      const crm = dashboardCrmSnapshotSchema.parse({
        total_contacts: metrics.data?.total_contacts ?? 0,
        open_deals: metrics.data?.open_deals ?? 0,
        open_pipeline_value: metrics.data?.open_pipeline_value ?? 0,
        leads_by_source: metrics.data?.leads_by_source ?? [],
        deals_by_stage: metrics.data?.deals_by_stage ?? [],
      })
      const booking = dashboardBookingSnapshotSchema.parse({
        today_count: bookingMetrics.data?.today_count ?? 0,
        week_count: bookingMetrics.data?.week_count ?? 0,
        upcoming_count: bookingMetrics.data?.upcoming_count ?? 0,
        pending_count: bookingMetrics.data?.pending_count ?? 0,
        completed_count: bookingMetrics.data?.completed_count ?? 0,
        cancelled_count: bookingMetrics.data?.cancelled_count ?? 0,
        no_show_count: bookingMetrics.data?.no_show_count ?? 0,
      })
      const inbox = dashboardInboxSnapshotSchema.parse({
        open_count: inboxMetrics.data?.open_count ?? 0,
        pending_count: inboxMetrics.data?.pending_count ?? 0,
        closed_count: inboxMetrics.data?.closed_count ?? 0,
        unassigned_count: inboxMetrics.data?.unassigned_count ?? 0,
      })
      const plan = subscription.data?.[0]

      return {
        contacts: crm.total_contacts,
        upcomingAppointments: booking.upcoming_count,
        openConversations: inbox.open_count,
        openDeals: crm.open_deals,
        dealValue: crm.open_pipeline_value,
        teamSize: members.count ?? 0,
        recentContacts: recent.data ?? [],
        planName: plan?.plans?.name ?? null,
        subscriptionStatus: plan?.status ?? null,
        planFeatures: (plan?.plans?.features as Record<string, boolean>) ?? {},
        leadSources: crm.leads_by_source,
        pipelineStages: crm.deals_by_stage,
      }
    },
  })

  const data = query.data
  const stats = [
    { label: 'Total contacts', value: data ? formatNumber(data.contacts) : null, icon: Users, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Upcoming appointments', value: data ? formatNumber(data.upcomingAppointments) : null, icon: CalendarClock, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Open conversations', value: data ? formatNumber(data.openConversations) : null, icon: MessageSquare, tone: 'bg-amber-50 text-amber-600' },
    { label: 'Open deal value', value: data ? formatCurrency(data.dealValue, currency) : null, icon: CircleDollarSign, tone: 'bg-emerald-50 text-emerald-600' },
  ]

  const checklist = [
    { label: 'Business workspace created', done: true },
    { label: 'Industry template applied', done: Boolean(data && data.contacts >= 0) },
    { label: 'Invite a team member', done: Boolean(data && data.teamSize > 1) },
    { label: 'Add your first contact', done: Boolean(data && data.contacts > 0) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Overview</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Good to see you{activeRole ? `, ${activeRole}` : ''}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Here's what's happening at <span className="font-medium text-ink-700">{activeTenant?.businesses?.name}</span>.
          </p>
        </div>
        <Badge variant="brand" className="w-fit">
          {data?.planName ?? 'Plan not assigned'} · {data?.subscriptionStatus ?? 'trial'}
        </Badge>
      </div>

      {query.isError ? (
        <Card><ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /></Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-ink-500">{label}</p>
                {query.isLoading ? <Skeleton className="mt-3 h-7 w-20" /> : <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900">{value}</p>}
              </div>
              <span className={`flex size-9 items-center justify-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
            </div>
          </Card>
        ))}
      </div>

      <DashboardCharts
        leadSources={data?.leadSources ?? []}
        pipelineStages={data?.pipelineStages ?? []}
        loading={query.isLoading}
        currency={currency}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent contacts</CardTitle>
              <CardDescription>Newest leads and customers in this workspace.</CardDescription>
            </div>
            <Link to="/app/contacts" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
              View contacts <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {query.isLoading ? (
              <div className="space-y-3 p-5">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-12" />)}</div>
            ) : data && data.recentContacts.length > 0 ? (
              <ul className="divide-y divide-ink-100">
                {data.recentContacts.map((contact) => (
                  <li key={contact.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={`${contact.first_name} ${contact.last_name ?? ''}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {contact.first_name} {contact.last_name ?? ''}
                      </p>
                      <p className="truncate text-xs text-ink-500">{contact.phone ?? contact.email ?? 'No contact details'}</p>
                    </div>
                    <Badge variant={contact.status === 'customer' ? 'success' : 'neutral'}>{contact.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<UserPlus className="size-5" />}
                title="No contacts yet"
                description="Once leads start arriving, they'll appear here. Add one from the Contacts screen."
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Getting started</CardTitle>
              <CardDescription>Your foundation setup at a glance.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {checklist.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5 text-sm text-ink-700">
                    <CheckCircle2 className={`size-4 shrink-0 ${item.done ? 'text-emerald-500' : 'text-ink-300'}`} />
                    {item.label}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-4">
                <Link to="/app/crm" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  CRM overview <ArrowRight className="size-3.5" />
                </Link>
                <Link to="/app/sales-agent" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Sales agent <ArrowRight className="size-3.5" />
                </Link>
                <Link to="/app/growth" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Growth overview <ArrowRight className="size-3.5" />
                </Link>
                <Link to="/app/contacts" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Add a contact <ArrowRight className="size-3.5" />
                </Link>
                <Link to="/app/appointments" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Appointments <ArrowRight className="size-3.5" />
                </Link>
                <Link to="/app/conversations" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Inbox <ArrowRight className="size-3.5" />
                </Link>
                <Link to="/app/team" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Manage your team <ArrowRight className="size-3.5" />
                </Link>
                <Link to="/app/tasks" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Tasks <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-brand-600 to-indigo-700 text-white">
            <CardContent>
              <Sparkles className="size-5 text-brand-200" />
              <h3 className="mt-3 text-sm font-semibold">AI Business Manager</h3>
              <p className="mt-1.5 text-xs leading-5 text-brand-100">
                Ask “How many leads today?” or “Which employee converts best?” once the AI layer is enabled. All answers
                will be tenant-scoped and audited.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {data ? (
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <Target className="size-3.5" /> {formatNumber(data.openDeals)} open deals · {formatNumber(data.teamSize)} active
          team members · {Object.values(data.planFeatures).filter(Boolean).length} plan features enabled
        </p>
      ) : null}
    </div>
  )
}
