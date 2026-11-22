import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { useRecordGrowthReview } from '../hooks'
import { emptyReviewForm, reviewSources, reviewStatuses, reviewSchema } from '../schemas'
import { reviewSourceLabel, reviewStatusLabel } from '../utils'

export function ReviewFormModal({
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
  const seed = emptyReviewForm()
  const [source, setSource] = useState<string>(seed.source)
  const [author, setAuthor] = useState(seed.author)
  const [rating, setRating] = useState(String(seed.rating))
  const [title, setTitle] = useState(seed.title ?? '')
  const [body, setBody] = useState(seed.body ?? '')
  const [reviewDate, setReviewDate] = useState(seed.review_date ?? '')
  const [status, setStatus] = useState<string>(seed.status)
  const [validationError, setValidationError] = useState<string | null>(null)

  const create = useRecordGrowthReview(tenantId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = reviewSchema.safeParse({
      source,
      author,
      rating: Number(rating),
      title: title || null,
      body: body || null,
      review_date: reviewDate || null,
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
      title="Record a review"
      description="Enter a review your team already received. No review provider is connected."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Source</span>
            <Select value={source} onChange={(event) => setSource(event.target.value)}>
              {reviewSources.map((item) => (
                <option key={item} value={item}>{reviewSourceLabel(item)}</option>
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
            <span className="text-xs font-semibold text-ink-700">Author</span>
            <Input value={author} onChange={(event) => setAuthor(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Review date</span>
            <Input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Status</span>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {reviewStatuses.filter((item) => item !== 'responded').map((item) => (
                <option key={item} value={item}>{reviewStatusLabel(item)}</option>
              ))}
            </Select>
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Title (optional)</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Review text (optional)</span>
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} />
        </label>

        {(validationError || create.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(create.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Record review</Button>
        </div>
      </form>
    </Modal>
  )
}
