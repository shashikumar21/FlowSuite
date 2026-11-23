export type ReviewSubmitRoute = 'private_feedback' | 'suggestion' | 'google_redirect'

export function safeReviewUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

// 1-3 stays private on FlowSuite, 4 stays on the FlowSuite suggestion screen,
// and only 5 opens the configured Google review URL. If the URL is missing or
// unsafe, 5 falls back to the suggestion screen rather than navigating away.
export function reviewSubmitRoute(rating: number, reviewUrl: string | null | undefined): ReviewSubmitRoute {
  if (rating === 5 && safeReviewUrl(reviewUrl)) return 'google_redirect'
  if (rating >= 4) return 'suggestion'
  return 'private_feedback'
}
