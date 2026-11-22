import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { useRecordReply } from '../hooks'
import { replyClassifications, replySchema } from '../schemas'
import { classificationLabel, impliesSuppression } from '../utils'
import type { ProspectOption } from '../api'

/** Manual reply entry. No inbox polling, webhook or provider is involved. */
export function ReplyFormModal({
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
  const [senderEmail, setSenderEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [classification, setClassification] = useState<string>('unknown')
  const [externalId, setExternalId] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const record = useRecordReply(tenantId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = replySchema.safeParse({
      prospect_id: prospectId,
      message_id: null,
      campaign_id: null,
      sender_email: senderEmail,
      subject: subject || null,
      body: body || null,
      classification,
      external_id: externalId || null,
      received_at: receivedAt ? new Date(receivedAt).toISOString() : null,
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
      title="Record a reply"
      description="Enter a reply you received. Nothing is fetched from a provider."
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
            <span className="text-xs font-semibold text-ink-700">Sender email</span>
            <Input type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} placeholder="name@example.com" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Subject</span>
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Optional" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Received at</span>
            <Input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Reply text</span>
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Paste what they wrote" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Classification</span>
            <Select value={classification} onChange={(event) => setClassification(event.target.value)}>
              {replyClassifications.map((value) => (
                <option key={value} value={value}>{classificationLabel(value)}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">External ID</span>
            <Input value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="Optional, makes re-entry idempotent" />
          </label>
        </div>

        {impliesSuppression(classification as (typeof replyClassifications)[number]) ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            The server will add this sender to the suppression list so future campaigns skip them.
          </p>
        ) : null}

        {(validationError || record.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(record.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={record.isPending}>Cancel</Button>
          <Button type="submit" loading={record.isPending}>Record reply</Button>
        </div>
      </form>
    </Modal>
  )
}
