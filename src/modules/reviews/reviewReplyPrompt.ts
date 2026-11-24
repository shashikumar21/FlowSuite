// Shared prompt hygiene for the owner-side review reply draft.
//
// The stored review text is public review content, not a patient record, but it
// is still untrusted free text. Nothing that looks like contact details or
// clinical/patient information is sent to the AI provider; in those cases the
// Edge Function uses the rating-only fallback reply.

export type ScreenedReviewFeedback = {
  safe: boolean
  text: string
}

const CONTACT_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d\s()-]{7,}\d/

const SENSITIVE_PATTERN = new RegExp(
  [
    'patient',
    'medical',
    'doctor',
    'dentist',
    'dental',
    'tooth',
    'teeth',
    'gum',
    'implant',
    'root canal',
    'cavity',
    'extraction',
    'surgery',
    'diagnos\\w*',
    'prescription',
    'medication',
    'medicine',
    'blood',
    'disease',
    'infection',
    'swelling',
    'treatment',
    'hospital',
  ].join('|'),
  'i',
)

export function screenReviewFeedback(value: string | null | undefined): ScreenedReviewFeedback {
  const text = (value ?? '').trim().slice(0, 500)
  if (!text) return { safe: true, text: '' }
  if (CONTACT_PATTERN.test(text) || SENSITIVE_PATTERN.test(text)) {
    return { safe: false, text: '' }
  }
  return { safe: true, text }
}

export function fallbackReviewReply(businessName: string, rating: number | null): string {
  const name = businessName || 'our business'
  if (rating !== null && rating >= 4) {
    return `Thank you for the kind words about ${name}. We are glad you had a good experience and appreciate you taking the time to share it.`
  }
  return `Thank you for sharing your feedback about ${name}. We take it seriously and will use it to improve.`
}
