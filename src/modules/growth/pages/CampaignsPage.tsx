import { useState } from 'react'
import { CalendarDays, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import type { GrowthCampaignRow } from '@/types/database'
import { CampaignFormModal } from '../components/CampaignFormModal'
import { useDeleteGrowthCampaign, useGrowthCampaigns, useGrowthCreatives } from '../hooks'
import { campaignStatusLabel, growthChannelLabel, canManageGrowth, statusVariant } from '../utils'

export function CampaignsPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const canManage = canManageGrowth(activeTenant?.role)
  const { toast } = useToast()
  const campaignsQuery = useGrowthCampaigns(tenantId)
  const creativesQuery = useGrowthCreatives(tenantId)
  const deleteCampaign = useDeleteGrowthCampaign(tenantId)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<GrowthCampaignRow | null>(null)

  if (!tenantId) return <ErrorState message="Select a business to manage its campaigns." />

  const campaigns = campaignsQuery.data ?? []
  const creativeCounts = new Map<string, number>()
  for (const creative of creativesQuery.data ?? []) {
    creativeCounts.set(creative.campaign_id, (creativeCounts.get(creative.campaign_id) ?? 0) + 1)
  }
  const refetch = () => {
    void campaignsQuery.refetch()
    void creativesQuery.refetch()
  }

  async function handleDelete(campaign: GrowthCampaignRow) {
    if (!canManage || !window.confirm(`Delete “${campaign.name}” and its creatives? This cannot be undone.`)) return
    try {
      await deleteCampaign.mutateAsync(campaign.id)
      toast({ title: 'Campaign deleted' })
    } catch (error) {
      toast({ title: 'Could not delete campaign', description: getErrorMessage(error), variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Campaigns</h1>
          <p className="mt-1 text-sm text-ink-500">
            Multi-channel plans. These records do not send messages or track delivery.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="size-4" /> New campaign
        </Button>
      </header>

      {campaignsQuery.isLoading || creativesQuery.isLoading ? (
        <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : campaignsQuery.isError || creativesQuery.isError ? (
        <ErrorState message={getErrorMessage(campaignsQuery.error ?? creativesQuery.error)} onRetry={refetch} />
      ) : campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target className="size-5" />}
            title="No campaigns yet"
            description="Create a campaign record to plan a channel and objective. Nothing is sent."
            action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> New campaign</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="space-y-3 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900">{campaign.name}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{growthChannelLabel(campaign.channel)}</p>
                  </div>
                  <Badge variant={statusVariant(campaign.status)}>{campaignStatusLabel(campaign.status)}</Badge>
                </div>
                <p className="text-sm text-ink-700">{campaign.objective}</p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-ink-500">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    {campaign.starts_on || campaign.ends_on
                      ? `${formatDate(campaign.starts_on)} → ${formatDate(campaign.ends_on)}`
                      : 'No dates set'}
                  </span>
                  <span>{creativeCounts.get(campaign.id) ?? 0} creatives</span>
                </div>
                {campaign.notes ? <p className="text-xs italic text-ink-500">{campaign.notes}</p> : null}
                <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(campaign); setOpen(true) }}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  {canManage ? (
                    <Button variant="ghost" size="sm" onClick={() => void handleDelete(campaign)}>
                      <Trash2 className="size-4 text-red-600" /> Delete
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {open ? (
        <CampaignFormModal
          key={editing?.id ?? 'new'}
          open
          onClose={() => { setOpen(false); setEditing(null) }}
          tenantId={tenantId}
          initial={editing}
          onSaved={refetch}
        />
      ) : null}
    </div>
  )
}
