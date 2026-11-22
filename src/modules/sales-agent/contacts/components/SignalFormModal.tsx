import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { useAddSignal } from '../hooks'
import { signalSchema, signalTypes } from '../schemas'
import { signalLabel } from '../utils'
import type { ProspectOption } from '../api'

/** Research notes written by a person. No provider call is made. */
export function SignalFormModal({
  open,
  onClose,
  tenantId,
  prospects,
  defaultProspectId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  prospects: ProspectOption[]
  defaultProspectId?: string
  onSaved?: () => void
}) {
  const [prospectId, setProspectId] = useState(defaultProspectId ?? prospects[0]?.id ?? '')
  const [signalType, setSignalType] = useState<string>('note')
  const [summary, setSummary] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const add = useAddSignal(tenantId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = signalSchema.safeParse({
      prospect_id: prospectId,
      signal_type: signalType,
      summary,
      source_url: sourceUrl || null,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    try {
      await add.mutateAsync(parsed.data)
      onSaved?.()
      onClose()
    } catch {
      // Error is rendered below.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!add.isPending) onClose() }}
      title="Add research signal"
      description="A note you personally found. It does not come from a provider."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Prospect</span>
            <Select value={prospectId} onChange={(event) => setProspectId(event.target.value)}>
              {prospects.length === 0 ? <option value="">Add a prospect first</option> : null}
              {prospects.map((prospect) => (
                <option key={prospect.id} value={prospect.id}>{prospect.business_name}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Type</span>
            <Select value={signalType} onChange={(event) => setSignalType(event.target.value)}>
              {signalTypes.map((value) => <option key={value} value={value}>{signalLabel(value)}</option>)}
            </Select>
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">What you found</span>
          <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="e.g. Hiring a marketing manager last week" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Source URL</span>
          <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Optional" />
        </label>

        {(validationError || add.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(add.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={add.isPending}>Cancel</Button>
          <Button type="submit" loading={add.isPending}>Save signal</Button>
        </div>
      </form>
    </Modal>
  )
}
