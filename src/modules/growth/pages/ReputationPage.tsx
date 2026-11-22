import { useState } from 'react'
import { MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Select } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import type { GrowthFeedbackRow, GrowthReviewRow } from '@/types/database'
import { FeedbackFormModal } from '../components/FeedbackFormModal'
import { ReviewFormModal } from '../components/ReviewFormModal'
import { ReviewResponseModal } from '../components/ReviewResponseModal'
import {
  useDeleteGrowthFeedback,
  useDeleteGrowthReview,
  useGrowthFeedback,
  useGrowthReviews,
  useUpdateGrowthFeedback,
} from '../hooks'
import { feedbackUpdateSchema, submissionStatuses } from '../schemas'
import {
  canManageGrowth,
  feedbackSourceLabel,
  ratingLabel,
  reviewSourceLabel,
  reviewStatusLabel,
  statusVariant,
  submissionStatusLabel,
} from '../utils'

export function ReputationPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const canManage = canManageGrowth(activeTenant?.role)
  const { toast } = useToast()
  const reviewsQuery = useGrowthReviews(tenantId)
  const feedbackQuery = useGrowthFeedback(tenantId)
  const deleteReview = useDeleteGrowthReview(tenantId)
  const updateFeedback = useUpdateGrowthFeedback(tenantId)
  const deleteFeedback = useDeleteGrowthFeedback(tenantId)

  const [reviewOpen, setReviewOpen] = useState(false)
  const [responseTarget, setResponseTarget] = useState<GrowthReviewRow | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  if (!tenantId) return <ErrorState message="Select a business to manage its reputation records." />

  const reviews = reviewsQuery.data ?? []
  const feedback = feedbackQuery.data ?? []
  const refetch = () => {
    void reviewsQuery.refetch()
    void feedbackQuery.refetch()
  }

  async function handleDeleteReview(review: GrowthReviewRow) {
    if (!canManage || !window.confirm(`Delete the review from ${review.author}? This cannot be undone.`)) return
    try {
      await deleteReview.mutateAsync(review.id)
      toast({ title: 'Review deleted' })
    } catch (error) {
      toast({ title: 'Could not delete review', description: getErrorMessage(error), variant: 'error' })
    }
  }

  async function handleFeedbackStatus(item: GrowthFeedbackRow, value: string) {
    const parsed = feedbackUpdateSchema.safeParse({ feedback_id: item.id, status: value })
    if (!parsed.success) {
      toast({ title: 'Invalid status', description: parsed.error.issues[0]?.message, variant: 'error' })
      return
    }
    try {
      await updateFeedback.mutateAsync({ id: item.id, status: parsed.data.status })
      toast({ title: 'Feedback updated' })
    } catch (error) {
      toast({ title: 'Could not update feedback', description: getErrorMessage(error), variant: 'error' })
    }
  }

  async function handleDeleteFeedback(item: GrowthFeedbackRow) {
    if (!canManage || !window.confirm(`Delete feedback from ${item.customer}? This cannot be undone.`)) return
    try {
      await deleteFeedback.mutateAsync(item.id)
      toast({ title: 'Feedback deleted' })
    } catch (error) {
      toast({ title: 'Could not delete feedback', description: getErrorMessage(error), variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Reputation</h1>
          <p className="mt-1 text-sm text-ink-500">
            Reviews and feedback entered by your team. No review provider is connected and responses are not posted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setFeedbackOpen(true)}>
            <Plus className="size-4" /> Record feedback
          </Button>
          <Button size="sm" onClick={() => setReviewOpen(true)}>
            <Plus className="size-4" /> Record review
          </Button>
        </div>
      </header>

      {reviewsQuery.isLoading || feedbackQuery.isLoading ? (
        <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : reviewsQuery.isError || feedbackQuery.isError ? (
        <ErrorState
          message={getErrorMessage(reviewsQuery.error ?? feedbackQuery.error)}
          onRetry={refetch}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Reviews</CardTitle>
              <CardDescription>
                A response records the signed-in responder on the server; it is never claimed by the browser.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? (
                <p className="text-sm text-ink-500">No reviews recorded yet.</p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {reviews.map((review) => (
                    <li key={review.id} className="flex flex-wrap items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-900">
                          {review.author}
                          <span className="ml-2 font-normal text-amber-600">{ratingLabel(review.rating)}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {reviewSourceLabel(review.source)} · {formatDate(review.review_date ?? review.created_at)}
                          {review.title ? ` · ${review.title}` : ''}
                        </p>
                        {review.body ? <p className="mt-1 text-sm text-ink-700">{review.body}</p> : null}
                        {review.response ? (
                          <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                            Response: {review.response}
                            {review.responded_by ? ' · responder recorded by the server' : ''}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant={statusVariant(review.status)}>{reviewStatusLabel(review.status)}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => setResponseTarget(review)}>
                        <Pencil className="size-4" /> Respond
                      </Button>
                      {canManage ? (
                        <Button variant="ghost" size="sm" onClick={() => void handleDeleteReview(review)} aria-label={`Delete review from ${review.author}`}>
                          <Trash2 className="size-4 text-red-600" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Direct feedback</CardTitle>
              <CardDescription>Feedback shared with your team in person, on WhatsApp or through your own site.</CardDescription>
            </CardHeader>
            <CardContent>
              {feedback.length === 0 ? (
                <p className="text-sm text-ink-500">No feedback recorded yet.</p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {feedback.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-900">
                          {item.customer}
                          <span className="ml-2 font-normal text-amber-600">{ratingLabel(item.rating)}</span>
                        </p>
                        <p className="truncate text-xs text-ink-500">
                          {feedbackSourceLabel(item.source)} · {formatDate(item.created_at)}
                          {item.comment ? ` · ${item.comment}` : ''}
                        </p>
                      </div>
                      <Badge variant={statusVariant(item.status)}>{submissionStatusLabel(item.status)}</Badge>
                      <Select
                        aria-label={`Change status for ${item.customer}`}
                        className="h-8 w-32 px-2 text-xs"
                        value={item.status}
                        onChange={(event) => void handleFeedbackStatus(item, event.target.value)}
                      >
                        {submissionStatuses.map((status) => (
                          <option key={status} value={status}>{submissionStatusLabel(status)}</option>
                        ))}
                      </Select>
                      {canManage ? (
                        <Button variant="ghost" size="sm" onClick={() => void handleDeleteFeedback(item)} aria-label={`Delete feedback from ${item.customer}`}>
                          <Trash2 className="size-4 text-red-600" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {reviewOpen ? (
        <ReviewFormModal open onClose={() => setReviewOpen(false)} tenantId={tenantId} onSaved={refetch} />
      ) : null}
      {feedbackOpen ? (
        <FeedbackFormModal open onClose={() => setFeedbackOpen(false)} tenantId={tenantId} onSaved={refetch} />
      ) : null}
      {responseTarget ? (
        <ReviewResponseModal
          key={responseTarget.id}
          open
          onClose={() => setResponseTarget(null)}
          tenantId={tenantId}
          review={responseTarget}
          onSaved={refetch}
        />
      ) : null}

      <p className="flex items-center gap-2 text-xs text-ink-500">
        <MessageSquare className="size-3.5" /> Everything here is manual. Nothing is fetched or posted automatically.
      </p>
    </div>
  )
}
