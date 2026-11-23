import { useEffect, useState } from 'react'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { DealStatusBadge } from './StatusBadges'
import { getErrorMessage } from '@/lib/errors'
import { formatCurrency, formatDate } from '@/lib/format'
import { assignDeal, deleteDeal, moveDealStage, updateDealValue, type CrmOptions, type DealWithContact } from '../api'
import { dealValueSchema } from '../schemas'
import { stagesForPipeline } from '../utils'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  deal: DealWithContact | null
  options: CrmOptions
  currency: string
  canManagePipeline: boolean
  onChanged: () => void
}

export function DealDetailModal({
  open,
  onClose,
  tenantId,
  deal,
  options,
  currency,
  canManagePipeline,
  onChanged,
}: Props) {
  const { toast } = useToast()
  const [stageId, setStageId] = useState('')
  const [assignee, setAssignee] = useState('')
  const [value, setValue] = useState('')
  const [valueError, setValueError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !deal) return
    setStageId(deal.stage_id)
    setAssignee(deal.assigned_to ?? '')
    setValue(String(deal.value))
    setValueError(null)
    setError(null)
  }, [open, deal])

  const stages = deal ? stagesForPipeline(options.stages, deal.pipeline_id) : []

  const apply = async (label: string, action: () => Promise<void>) => {
    if (!deal) return
    setBusy(true)
    setError(null)
    try {
      await action()
      toast({ title: label })
      onChanged()
      onClose()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const saveValue = async () => {
    if (!deal) return
    const parsed = dealValueSchema.safeParse({ value })
    if (!parsed.success) {
      setValueError(parsed.error.issues[0]?.message ?? 'Enter a valid value')
      return
    }
    setValueError(null)
    await apply('Deal value updated', () => updateDealValue(tenantId, deal.id, parsed.data.value))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={deal?.title ?? 'Deal'}
      description={deal?.contacts ? `${deal.contacts.first_name} ${deal.contacts.last_name ?? ''}`.trim() : undefined}
    >
      {!deal ? null : (
        <div className="space-y-5">
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <DealStatusBadge status={deal.status} />
            {deal.description ? null : <Badge variant="neutral">{formatCurrency(Number(deal.value), currency)}</Badge>}
          </div>

          <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-ink-100 bg-ink-50/60 p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-ink-500">Value</dt><dd className="font-semibold text-ink-900">{formatCurrency(Number(deal.value), currency)}</dd></div>
            <div><dt className="text-xs text-ink-500">Probability</dt><dd className="text-ink-900">{deal.probability}%</dd></div>
            <div><dt className="text-xs text-ink-500">Expected close</dt><dd className="text-ink-900">{formatDate(deal.expected_close_date)}</dd></div>
            <div>
              <dt className="text-xs text-ink-500">Company</dt>
              <dd className="text-ink-900">{deal.contacts?.company ?? '—'}</dd>
            </div>
            {deal.description ? (
              <div className="sm:col-span-2"><dt className="text-xs text-ink-500">Description</dt><dd className="whitespace-pre-wrap text-ink-700">{deal.description}</dd></div>
            ) : null}
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="deal-detail-stage">Stage</Label>
              <Select id="deal-detail-stage" value={stageId} onChange={(event) => setStageId(event.target.value)}>
                {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                loading={busy}
                disabled={!stageId || stageId === deal.stage_id}
                onClick={() => void apply('Deal moved', () => moveDealStage(tenantId, deal.id, stageId))}
              >
                Move deal
              </Button>
            </div>

            {canManagePipeline ? (
              <div>
                <Label htmlFor="deal-detail-assignee">Owner</Label>
                <Select id="deal-detail-assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                  <option value="">Unassigned</option>
                  {options.members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name ?? member.user_id} ({member.role})
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  loading={busy}
                  disabled={assignee === (deal.assigned_to ?? '')}
                  onClick={() => void apply('Deal reassigned', () => assignDeal(tenantId, deal.id, assignee || null))}
                >
                  Save owner
                </Button>
              </div>
            ) : null}

            <div>
              <Label htmlFor="deal-detail-value">Value ({currency})</Label>
              <Input
                id="deal-detail-value"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={value}
                aria-invalid={Boolean(valueError)}
                onChange={(event) => {
                  setValue(event.target.value)
                  setValueError(null)
                }}
              />
              <FieldError>{valueError ?? undefined}</FieldError>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                loading={busy}
                disabled={value === String(deal.value)}
                onClick={() => void saveValue()}
              >
                Save value
              </Button>
            </div>
          </div>

          {canManagePipeline ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-900">Danger zone</p>
              <p className="mt-1 text-xs text-red-700">Deleting a deal removes it permanently. This action is server-side and audited.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
                loading={busy}
                onClick={() => {
                  if (!window.confirm(`Delete deal "${deal.title}"? This cannot be undone.`)) return
                  void apply('Deal deleted', () => deleteDeal(tenantId, deal.id))
                }}
              >
                Delete deal
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
