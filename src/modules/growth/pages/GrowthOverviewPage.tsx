import { Link } from 'react-router-dom'
import {
  ArrowRight,
  FileText,
  Globe,
  Megaphone,
  MessageSquare,
  Send,
  Star,
  Target,
  Wrench,
} from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import {
  useGrowthCampaigns,
  useGrowthCreatives,
  useGrowthFeedback,
  useGrowthReviews,
  useGrowthSubmissions,
  useGrowthWebsites,
} from '../hooks'
import { buildGrowthSummary } from '../utils'

const MODULE_LINKS = [
  { label: 'Marketing', to: '/app/growth/marketing', detail: 'Plan copy for WhatsApp, SMS, ads and social.', icon: Megaphone },
  { label: 'Campaigns', to: '/app/growth/campaigns', detail: 'Multi-channel campaign records and dates.', icon: Target },
  { label: 'Websites', to: '/app/growth/websites', detail: 'Page records and manually recorded form leads.', icon: Globe },
  { label: 'Reputation', to: '/app/growth/reputation', detail: 'Reviews, responses and direct feedback.', icon: Star },
] as const

const NOT_CONNECTED = [
  { label: 'WhatsApp / SMS broadcasts', detail: 'Copy can be saved; no message is sent.' },
  { label: 'Ad platforms', detail: 'No ad account is connected and no spend is reported.' },
  { label: 'Website hosting & domains', detail: 'Page records are internal; no site is published.' },
  { label: 'Review sources & AI replies', detail: 'Reviews are entered by your team; responses are not posted.' },
] as const

export function GrowthOverviewPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const campaignsQuery = useGrowthCampaigns(tenantId)
  const creativesQuery = useGrowthCreatives(tenantId)
  const websitesQuery = useGrowthWebsites(tenantId)
  const submissionsQuery = useGrowthSubmissions(tenantId)
  const reviewsQuery = useGrowthReviews(tenantId)
  const feedbackQuery = useGrowthFeedback(tenantId)

  if (!tenantId) {
    return <ErrorState message="Select a business to view its growth data." />
  }

  const queries = [campaignsQuery, creativesQuery, websitesQuery, submissionsQuery, reviewsQuery, feedbackQuery]
  const isLoading = queries.some((query) => query.isLoading)
  const error = queries.find((query) => query.isError)?.error
  const refetch = () => queries.forEach((query) => void query.refetch())

  const summary = buildGrowthSummary({
    campaigns: campaignsQuery.data ?? [],
    creatives: creativesQuery.data ?? [],
    websites: websitesQuery.data ?? [],
    submissions: submissionsQuery.data ?? [],
    reviews: reviewsQuery.data ?? [],
    feedback: feedbackQuery.data ?? [],
  })

  const cards = [
    { label: 'Campaigns', value: summary.campaigns, icon: Target },
    { label: 'Active campaigns', value: summary.activeCampaigns, icon: Send },
    { label: 'Creatives', value: summary.creatives, icon: FileText },
    { label: 'Website records', value: summary.websites, icon: Globe },
    { label: 'Form submissions', value: summary.submissions, icon: MessageSquare },
    { label: 'New submissions', value: summary.newSubmissions, icon: MessageSquare },
    { label: 'Reviews', value: summary.reviews, icon: Star },
    { label: 'New reviews', value: summary.newReviews, icon: Star },
    { label: 'Feedback entries', value: summary.feedback, icon: MessageSquare },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-900">Growth</h1>
            <Badge variant="brand">LOCAL</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            Planning and records for this business. Counts come from saved rows only.
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}><CardContent className="py-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={getErrorMessage(error)} onRetry={refetch} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.label}>
                <CardContent className="flex items-center justify-between gap-3 py-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{card.label}</p>
                    <p className="mt-1 text-2xl font-bold text-ink-900">{formatNumber(card.value)}</p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="size-5" />
                  </span>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
          <CardDescription>Each area is scoped to the active business.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {MODULE_LINKS.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.label}
                to={item.to}
                className="flex items-center justify-between rounded-lg border border-ink-200 p-3 text-sm hover:bg-ink-50"
              >
                <span className="flex items-start gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  <span>
                    <span className="block font-semibold text-ink-900">{item.label}</span>
                    <span className="block text-xs text-ink-500">{item.detail}</span>
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-ink-400" />
              </Link>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Not connected yet</CardTitle>
          <CardDescription>These capabilities are deliberately absent. No placeholder results are shown.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {NOT_CONNECTED.map((item) => (
            <div key={item.label} className="rounded-lg border border-ink-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">{item.label}</p>
                <Badge variant="neutral"><Wrench className="mr-1 inline size-3" />Pending</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-500">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
