import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import type { GrowthCreativeRow } from '@/types/database'
import { CreativeFormModal } from '../components/CreativeFormModal'
import { useDeleteGrowthCreative, useGrowthCampaigns, useGrowthCreatives } from '../hooks'
import type { CampaignOption } from '../types'
import { canManageGrowth, creativeStatusLabel, growthChannelLabel, statusVariant } from '../utils'

export function MarketingPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const canManage = canManageGrowth(activeTenant?.role)
  const { toast } = useToast()
  const campaignsQuery = useGrowthCampaigns(tenantId)
  const creativesQuery = useGrowthCreatives(tenantId)
  const deleteCreative = useDeleteGrowthCreative(tenantId)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<GrowthCreativeRow | null>(null)

  if (!tenantId) return <ErrorState message="Select a business to manage its marketing copy." />

  const campaigns: CampaignOption[] = (campaignsQuery.data ?? []).map(({ id, name, channel }) => ({ id, name, channel }))
  const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]))
  const creatives = creativesQuery.data ?? []
  const refetch = () => {
    void campaignsQuery.refetch()
    void creativesQuery.refetch()
  }

  async function handleDelete(creative: GrowthCreativeRow) {
    if (!canManage || !window.confirm(`Delete “${creative.name}”? This cannot be undone.`)) return
    try {
      await deleteCreative.mutateAsync(creative.id)
      toast({ title: 'Creative deleted' })
    } catch (error) {
      toast({ title: 'Could not delete creative', description: getErrorMessage(error), variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Marketing</h1>
          <p className="mt-1 text-sm text-ink-500">
            Copy for planned channels. No WhatsApp, SMS, ad or social account is connected and nothing is sent.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }} disabled={campaigns.length === 0}>
          <Plus className="size-4" /> New creative
        </Button>
      </header>

      {campaignsQuery.isLoading || creativesQuery.isLoading ? (
        <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : campaignsQuery.isError || creativesQuery.isError ? (
        <ErrorState message={getErrorMessage(campaignsQuery.error ?? creativesQuery.error)} onRetry={refetch} />
      ) : campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="size-5" />}
            title="Create a campaign first"
            description="Creatives belong to a campaign record. There is no broadcast action here."
            action={
              <Link to="/app/growth/campaigns" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                Go to campaigns
              </Link>
            }
          />
        </Card>
      ) : creatives.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No creatives yet"
            description="Save draft copy for one of your campaigns."
            action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> New creative</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {creatives.map((creative) => (
            <Card key={creative.id}>
              <CardContent className="space-y-3 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900">{creative.name}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {campaignNames.get(creative.campaign_id) ?? 'Campaign'} · {growthChannelLabel(creative.channel)}
                    </p>
                  </div>
                  <Badge variant={statusVariant(creative.status)}>{creativeStatusLabel(creative.status)}</Badge>
                </div>
                {creative.headline ? <p className="text-sm font-medium text-ink-800">{creative.headline}</p> : null}
                <p className="whitespace-pre-wrap text-sm text-ink-700">{creative.message}</p>
                {creative.cta ? <p className="text-xs text-brand-700">CTA: {creative.cta}</p> : null}
                <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(creative); setOpen(true) }}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  {canManage ? (
                    <Button variant="ghost" size="sm" onClick={() => void handleDelete(creative)}>
                      <Trash2 className="size-4 text-red-600" /> Delete
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {open && campaigns.length > 0 ? (
        <CreativeFormModal
          key={editing?.id ?? 'new'}
          open
          onClose={() => { setOpen(false); setEditing(null) }}
          tenantId={tenantId}
          campaigns={campaigns}
          initial={editing}
          onSaved={refetch}
        />
      ) : null}
    </div>
  )
}
