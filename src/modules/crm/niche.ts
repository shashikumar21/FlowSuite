/**
 * Tenant industry slugs come from `businesses.industry` (seeded in
 * 0002_business_configuration.sql). Dental clinics work with patients and
 * enquiries rather than B2B companies, so the CRM adapts its labels and field
 * order from this value. No new persisted setting or migration is needed.
 */
const DENTAL_INDUSTRIES = new Set(['dental-clinic', 'dental', 'dentist', 'dentistry'])

export function isDentalIndustry(industry: string | null | undefined): boolean {
  if (!industry) return false
  const normalized = industry.trim().toLowerCase().replace(/[\s_]+/g, '-')
  return DENTAL_INDUSTRIES.has(normalized)
}
