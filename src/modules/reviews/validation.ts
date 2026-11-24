const GOOGLE_REVIEW_HOSTS = [
  'google.com',
  'www.google.com',
  'maps.google.com',
  'search.google.com',
  'g.page',
  'maps.app.goo.gl',
]

export function normalizeGoogleReviewUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

export function isGoogleReviewUrl(value: string | null | undefined): boolean {
  const url = normalizeGoogleReviewUrl(value)
  if (!url || url.length > 500 || url.includes('#')) return false
  if (!url.startsWith('https://')) return false

  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password) return false
    return GOOGLE_REVIEW_HOSTS.includes(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Human-readable host only; never exposes the full review URL in a list. */
export function reviewLinkHost(value: string | null | undefined): string {
  const url = normalizeGoogleReviewUrl(value)
  if (!url) return 'FlowSuite'
  if (!isGoogleReviewUrl(url)) return 'Custom link'
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return 'Custom link'
  }
}
