import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { GrowthCampaignRow } from '@/types/database'
import {
  useCreateGrowthCampaign,
  useUpdateGrowthCampaign,
} from '../hooks'
import { campaignSchema, campaignStatuses, emptyCampaignForm, growthChannels, type CampaignFormValues } from '../schemas'
import { campaignStatusLabel, growthChannelLabel } from '../utils'

export function CampaignFormModal({
  open,
  onClose,
  tenantId,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  initial?: GrowthCampaignRow | null
  onSaved?: () => void
}) {
  const seed: CampaignFormValues = initial
    ? {
        name: initial.name,
        channel: initial.channel,
        objective: initial.objective,
        status: initial.status,
        starts_on: initial.starts_on,
        ends_on: initial.ends_on,
        notes: initial.notes,
      }
    : emptyCampaignForm()
  const [name, setName] = useState(seed.name)
  const [channel, setChannel] = useState<string>(seed.channel)
  const [objective, setObjective] = useState(seed.objective)
  const [status, setStatus] = useState<string>(seed.status)
  const [startsOn, setStartsOn] = useState(seed.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(seed.ends_on ?? '')
  const [notes, setNotes] = useState(seed.notes ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const create = useCreateGrowthCampaign(tenantId)
  const update = useUpdateGrowthCampaign(tenantId)
  const pending = create.isPending || update.isPending

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = campaignSchema.safeParse({
      name,
      channel,
      objective,
      status,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      notes: notes || null,
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
      // The RPC error is rendered below; keep the form open for correction.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!pending) onClose() }}
      title={initial ? 'Edit campaign' : 'New campaign'}
      description="A planning record for this business. Nothing is sent from here."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Campaign name</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Festive offer" />
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
              {campaignStatuses.map((item) => (
                <option key={item} value={item}>{campaignStatusLabel(item)}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Start date</span>
            <Input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">End date</span>
            <Input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Objective</span>
          <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="What should this campaign achieve?" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Notes (optional)</span>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Internal planning notes" />
        </label>

        {(validationError || create.isError || update.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(create.error ?? update.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" loading={pending}>{initial ? 'Save changes' : 'Create campaign'}</Button>
        </div>
      </form>
    </Modal>
  )
}
