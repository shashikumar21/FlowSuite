import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Star, Copy, ExternalLink, CheckCircle2, MessageSquareHeart } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Label, Textarea } from '@/components/ui/Input'
import { copyText } from '@/lib/clipboard'
import { getErrorMessage } from '@/lib/errors'
import { fetchPublicReview, generateReviewSuggestion, markReviewClicked, submitPublicReviewFeedback, type PublicReview } from '../api'
import { reviewSubmitRoute, safeReviewUrl } from '../reviewRouting'

export function PublicReviewPage() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<PublicReview | null>(null)
  const [rating, setRating] = useState<number>(0)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [redirectUnavailable, setRedirectUnavailable] = useState(false)

  const load = async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const data = await fetchPublicReview(token)
      setReview(data)
      if (data?.rating) setRating(data.rating)
      if (data?.customer_feedback) setFeedback(data.customer_feedback)
      if (data?.ai_suggestion) setSuggestion(data.ai_suggestion)
    } catch (e) { setError(getErrorMessage(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [token])

  const submit = async () => {
    if (!token || rating < 1) return
    setSubmitting(true)
    setRedirectUnavailable(false)
    try {
      await submitPublicReviewFeedback(token, rating, feedback)
      const updated = await fetchPublicReview(token)
      setReview(updated)

      const route = reviewSubmitRoute(rating, updated?.review_url)
      if (route === 'google_redirect') {
        try { await markReviewClicked(token) } catch { /* best-effort analytics only */ }
        window.location.assign(safeReviewUrl(updated?.review_url) as string)
        return
      }

      if (route === 'suggestion') {
        if (rating === 5) setRedirectUnavailable(true)
        setSuggestionLoading(true)
        try {
          const res = await generateReviewSuggestion(token)
          setSuggestion(res.suggestion ?? null)
        } catch { /* fallback already may be stored; ignore */ }
        finally { setSuggestionLoading(false) }
      }
    } catch (e) { setError(getErrorMessage(e)) }
    finally { setSubmitting(false) }
  }

  const copySuggestion = async () => {
    if (!suggestion) return
    if (await copyText(suggestion)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } else {
      setCopyFailed(true)
      setTimeout(() => setCopyFailed(false), 2500)
    }
  }

  const openReviewLink = async () => {
    const url = safeReviewUrl(review?.review_url)
    if (!url || !token) return
    void markReviewClicked(token)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <div className="mx-auto max-w-xl p-6"><Skeleton className="h-64 w-full" /></div>
  if (error) return <div className="mx-auto max-w-xl p-6"><ErrorState message={error} onRetry={() => void load()} /></div>
  if (!review) return <div className="mx-auto max-w-xl p-6"><ErrorState message="Review link not found." /></div>

  const submitted = Boolean(review.feedback_submitted_at)
  const isPositive = (review.rating ?? rating) >= 4

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Feedback</p>
          <h1 className="mt-2 text-2xl font-bold text-ink-900">{review.business_name}</h1>
          <p className="mt-1 text-sm text-ink-500">Your feedback helps us improve. It only takes a moment.</p>
        </div>

        <Card>
          <CardContent className="space-y-5 py-6">
            <div>
              <Label>How was your experience?</Label>
              <div className="mt-2 flex gap-2">
                {[1,2,3,4,5].map((n) => (
                  <button key={n} type="button" onClick={() => !submitted && setRating(n)} className={`rounded-lg p-2 ${ (review.rating ?? rating) >= n ? 'text-amber-500' : 'text-ink-300' }`} aria-label={`${n} star`}>
                    <Star className="size-7 fill-current" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Anything you'd like to share? (optional)</Label>
              <Textarea rows={3} value={review.customer_feedback ?? feedback} onChange={(e) => setFeedback(e.target.value)} disabled={submitted} placeholder="What went well, or what could be better?" />
            </div>

            {!submitted ? (
              <Button onClick={() => void submit()} loading={submitting} disabled={rating < 1} className="w-full">Submit feedback</Button>
            ) : (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800 flex items-center gap-2"><CheckCircle2 className="size-4" /> Thanks for your feedback!</div>
            )}

            {submitted && redirectUnavailable ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Thank you for the 5-star rating. The Google review link is not configured, so we kept you here. You can still copy the suggested text below.
              </div>
            ) : null}

            {submitted && isPositive ? (
              <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-4">
                <div className="flex items-center gap-2 text-brand-800 font-medium"><MessageSquareHeart className="size-4" /> Suggested review (you can edit/copy)</div>
                {suggestionLoading ? <Skeleton className="h-20 w-full" /> : suggestion ? (
                  <>
                    <Textarea rows={4} value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void copySuggestion()}><Copy className="size-4" /> {copied ? 'Copied' : copyFailed ? 'Select text to copy' : 'Copy text'}</Button>
                      {review.review_url ? <Button onClick={() => void openReviewLink()}><ExternalLink className="size-4" /> Open review link</Button> : null}
                    </div>
                    {!review.review_url ? <p className="text-xs text-ink-500">No public review URL configured. You can still copy the text.</p> : null}
                  </>
                ) : <p className="text-sm text-ink-500">No suggestion available.</p>}
              </div>
            ) : null}

            {submitted && !isPositive ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">Thank you for letting us know.</p>
                <p className="mt-1">Your feedback has been shared privately so the team can improve. We appreciate your honesty.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
