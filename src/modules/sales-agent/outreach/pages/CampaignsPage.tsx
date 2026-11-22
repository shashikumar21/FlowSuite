import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Megaphone, Plus } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { useCampaigns, useDraftViews, useProspectOptions, useSuppression } from '../hooks'
import { CampaignFormModal } from '../components/CampaignFormModal'
import { campaignStatusLabel } from '../utils'

export function CampaignsPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const [showForm, setShowForm] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const campaigns = useCampaigns(tenantId)
  const drafts = useDraftViews(tenantId)
  const prospects = useProspectOptions(tenantId)
  const suppression = useSuppression(tenantId)

  if (!tenantId) return <ErrorState message="Select a business to view its campaigns." />

  const counts = new Map<string, number>()
  for (const draft of drafts.data ?? []) {
    counts.set(draft.message.campaign_id, (counts.get(draft.message.campaign_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Campaigns</h1>
          <p className="mt-1 text-sm text-ink-500">
            Group prospects and prepare personalised drafts. Creating a campaign never sends an email.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="size-4" /> New campaign
        </Button>
      </header>

      {notice ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}

      {campaigns.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : campaigns.isError ? (
        <ErrorState message={getErrorMessage(campaigns.error)} onRetry={() => void campaigns.refetch()} />
      ) : (campaigns.data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone className="size-5" />}
            title="No campaigns yet"
            description="Create a campaign to select recipients. Drafts are created only after you do."
            action={<Button variant="outline" onClick={() => setShowForm(true)}>Create your first campaign</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(campaigns.data ?? []).map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="space-y-3 py-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-ink-900">{campaign.name}</p>
                  <Badge variant={campaign.status === 'approved' ? 'success' : campaign.status === 'rejected' ? 'danger' : 'neutral'}>
                    {campaignStatusLabel(campaign.status)}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-xs text-ink-500">{campaign.objective || 'No objective recorded.'}</p>
                <div className="flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-500">
                  <span>{counts.get(campaign.id) ?? 0} draft recipient(s)</span>
                  <Link
                    to={`/app/sales-agent/email-writer?campaign=${campaign.id}`}
                    className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Open drafts <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="py-4 text-xs leading-5 text-ink-500">
          Recipients without an email address and recipients on the suppression list are skipped by the server.
          Counts above reflect real draft rows only. No delivery data is shown because no email provider is configured.
        </CardContent>
      </Card>

      <CampaignFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        tenantId={tenantId}
        prospects={prospects.data ?? []}
        suppression={suppression.data ?? []}
        onCreated={(_campaignId, message) => setNotice(message)}
      />
    </div>
  )
}

