import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { GrowthCreativeRow } from '@/types/database'
import { useCreateGrowthCreative, useUpdateGrowthCreative } from '../hooks'
import {
  creativeSchema,
  creativeStatuses,
  emptyCreativeForm,
  growthChannels,
  type CreativeFormValues,
} from '../schemas'
import type { CampaignOption } from '../types'
import { creativeStatusLabel, growthChannelLabel } from '../utils'

export function CreativeFormModal({
  open,
  onClose,
  tenantId,
  campaigns,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  campaigns: CampaignOption[]
  initial?: GrowthCreativeRow | null
  onSaved?: () => void
}) {
  const seed: CreativeFormValues = initial
    ? {
        campaign_id: initial.campaign_id,
        name: initial.name,
        channel: initial.channel,
        headline: initial.headline,
        message: initial.message,
        cta: initial.cta,
        status: initial.status,
      }
    : emptyCreativeForm(campaigns[0]?.id ?? '')
  const [campaignId, setCampaignId] = useState(seed.campaign_id)
  const [name, setName] = useState(seed.name)
  const [channel, setChannel] = useState<string>(seed.channel)
  const [headline, setHeadline] = useState(seed.headline ?? '')
  const [message, setMessage] = useState(seed.message)
  const [cta, setCta] = useState(seed.cta ?? '')
  const [status, setStatus] = useState<string>(seed.status)
  const [validationError, setValidationError] = useState<string | null>(null)

  const create = useCreateGrowthCreative(tenantId)
  const update = useUpdateGrowthCreative(tenantId)
  const pending = create.isPending || update.isPending

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = creativeSchema.safeParse({
      campaign_id: campaignId,
      name,
      channel,
      headline: headline || null,
      message,
      cta: cta || null,
      status,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    try {
      if (initial) await update.mutateAsync({ id: initial.id, values: parsed.data })
      else await create.mutateAsync(parsed.data)
      onSaved?.()
      onClose()
    } catch {
      // Keep the form open so the RPC error can be corrected.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!pending) onClose() }}
      title={initial ? 'Edit creative' : 'New creative'}
      description="Copy is stored for planning only. This app has no broadcast provider."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Campaign</span>
          <Select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} disabled={Boolean(initial)}>
            {campaigns.length === 0 ? <option value="">Add a campaign first</option> : null}
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Creative name</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Diwali WhatsApp copy" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Channel</span>
            <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
              {growthChannels.map((item) => (
                <option key={item} value={item}>{growthChannelLabel(item)}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Status</span>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {creativeStatuses.map((item) => (
                <option key={item} value={item}>{creativeStatusLabel(item)}</option>
              ))}
            </Select>
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Headline (optional)</span>
          <Input value={headline} onChange={(event) => setHeadline(event.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Message</span>
          <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Draft copy for this channel" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Call to action (optional)</span>
          <Input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="Book an appointment" />
        </label>

        {(validationError || create.isError || update.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(create.error ?? update.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" loading={pending}>{initial ? 'Save changes' : 'Save creative'}</Button>
        </div>
      </form>
    </Modal>
  )
}
