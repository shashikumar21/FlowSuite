import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { useRecordGrowthFeedback } from '../hooks'
import { emptyFeedbackForm, feedbackSchema, feedbackSources, submissionStatuses } from '../schemas'
import { feedbackSourceLabel, submissionStatusLabel } from '../utils'

export function FeedbackFormModal({
  open,
  onClose,
  tenantId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  onSaved?: () => void
}) {
  const seed = emptyFeedbackForm()
  const [source, setSource] = useState<string>(seed.source)
  const [customer, setCustomer] = useState(seed.customer)
  const [rating, setRating] = useState(String(seed.rating))
  const [comment, setComment] = useState(seed.comment ?? '')
  const [status, setStatus] = useState<string>(seed.status)
  const [validationError, setValidationError] = useState<string | null>(null)

  const create = useRecordGrowthFeedback(tenantId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = feedbackSchema.safeParse({
      source,
      customer,
      rating: Number(rating),
      comment: comment || null,
      status,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    try {
      await create.mutateAsync(parsed.data)
      onSaved?.()
      onClose()
    } catch {
      // Keep the form open so the RPC error can be corrected.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!create.isPending) onClose() }}
      title="Record feedback"
      description="Feedback your team received directly. No survey provider is connected."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Source</span>
            <Select value={source} onChange={(event) => setSource(event.target.value)}>
              {feedbackSources.map((item) => (
                <option key={item} value={item}>{feedbackSourceLabel(item)}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Rating</span>
            <Select value={rating} onChange={(event) => setRating(event.target.value)}>
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>{value}/5</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Customer</span>
            <Input value={customer} onChange={(event) => setCustomer(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Status</span>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {submissionStatuses.map((item) => (
                <option key={item} value={item}>{submissionStatusLabel(item)}</option>
              ))}
            </Select>
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Comment (optional)</span>
          <Textarea value={comment} onChange={(event) => setComment(event.target.value)} />
        </label>

        {(validationError || create.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(create.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Record feedback</Button>
        </div>
      </form>
    </Modal>
  )
}
