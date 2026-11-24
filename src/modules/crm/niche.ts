/**
 * Tenant industry slugs come from `businesses.industry` (seeded in
 * 0002_business_configuration.sql). Dental clinics work with patients and
 * enquiries rather than B2B companies, so the CRM adapts its labels and field
 * order from this value. No new persisted setting or migration is needed.
 */
const DENTAL_INDUSTRIES = new Set(['dental-clinic', 'dental', 'dentist', 'dentistry'])

// Clinics need patient-style required fields even when they are not dental.
const CLINIC_INDUSTRIES = new Set([
  ...DENTAL_INDUSTRIES,
  'clinic',
  'medical',
  'medical-clinic',
  'healthcare',
  'hospital',
])

function normalizeIndustry(industry: string | null | undefined): string {
  if (!industry) return ''
  return industry.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

export function isDentalIndustry(industry: string | null | undefined): boolean {
  return DENTAL_INDUSTRIES.has(normalizeIndustry(industry))
}

export function isClinicIndustry(industry: string | null | undefined): boolean {
  return CLINIC_INDUSTRIES.has(normalizeIndustry(industry))
}
