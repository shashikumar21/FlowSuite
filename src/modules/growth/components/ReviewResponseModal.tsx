import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { GrowthReviewRow } from '@/types/database'
import { useUpdateGrowthReview } from '../hooks'
import { reviewStatuses, reviewUpdateSchema } from '../schemas'
import { reviewStatusLabel } from '../utils'

export function ReviewResponseModal({
  open,
  onClose,
  tenantId,
  review,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  review: GrowthReviewRow
  onSaved?: () => void
}) {
  const [status, setStatus] = useState<string>(review.status)
  const [response, setResponse] = useState(review.response ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)
  const update = useUpdateGrowthReview(tenantId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = reviewUpdateSchema.safeParse({
      review_id: review.id,
      status,
      response: response || null,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    try {
      // No responded_by argument: the RPC stamps it with the signed-in user.
      await update.mutateAsync(parsed.data)
      onSaved?.()
      onClose()
    } catch {
      // Keep the form open so the RPC error can be corrected.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!update.isPending) onClose() }}
      title="Review response"
      description={`Response to ${review.author}. This is stored locally; it is not posted to the review source.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">
          {review.title ? `${review.title} · ` : ''}{review.rating}/5 · {review.body || 'No written review'}
        </p>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Status</span>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {reviewStatuses.map((item) => (
              <option key={item} value={item}>{reviewStatusLabel(item)}</option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Response</span>
          <Textarea value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Write the response your team approved" />
        </label>
        <p className="text-xs text-ink-500">
          The database records who responded. A response is required before a review can be marked “Responded”.
        </p>

        {(validationError || update.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(update.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={update.isPending}>Cancel</Button>
          <Button type="submit" loading={update.isPending}>Save response</Button>
        </div>
      </form>
    </Modal>
  )
}
