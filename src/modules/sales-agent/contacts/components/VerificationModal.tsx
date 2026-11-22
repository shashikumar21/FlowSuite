import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { useRecordVerification } from '../hooks'
import { verificationSchema, verificationStatuses } from '../schemas'
import { verificationLabel } from '../utils'

/**
 * Manual attestation only. The RPC stores `checked_by = auth.uid()` and never
 * accepts a provider name from the browser, so a person is always on record.
 */
export function VerificationModal({
  open,
  onClose,
  tenantId,
  entityType,
  entityId,
  label,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  entityType: 'prospect' | 'decision_maker'
  entityId: string
  label: string
  onSaved?: () => void
}) {
  const { user } = useAuth()
  const [status, setStatus] = useState<string>('verified')
  const [note, setNote] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const record = useRecordVerification(tenantId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = verificationSchema.safeParse({
      entity_type: entityType,
      entity_id: entityId,
      status,
      method: 'manual',
      note,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    try {
      await record.mutateAsync(parsed.data)
      onSaved?.()
      onClose()
    } catch {
      // Error is rendered below.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!record.isPending) onClose() }}
      title="Record verification"
      description={`Manual attestation for ${label}.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-brand-50 px-3 py-3 text-sm text-brand-800">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <p>
            No verification provider is connected. The database will record <strong>{user?.email ?? 'you'}</strong>{' '}
            as the person who checked this, never a provider. Evidence is append-only.
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Result</span>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {verificationStatuses.map((value) => (
              <option key={value} value={value}>{verificationLabel(value)}</option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Evidence note</span>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What did you check and how? (optional, stored as evidence)"
          />
        </label>

        {(validationError || record.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(record.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={record.isPending}>Cancel</Button>
          <Button type="submit" loading={record.isPending}>Record verification</Button>
        </div>
      </form>
    </Modal>
  )
}
