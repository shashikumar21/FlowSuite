import { z } from 'zod'

/**
 * Form schemas for the native AI Sales Agent module. They mirror the checks in
 * 0017_ai_sales_agent.sql; the database RPCs remain authoritative.
 * No provider is called by these forms — discovery is manual in Phase 2.
 */

export const leadStatusOptions = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'converted', label: 'Converted' },
] as const

export const verificationStatusOptions = [
  { value: 'unverified', label: 'Unverified' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'invalid', label: 'Invalid' },
  { value: 'unknown', label: 'Unknown' },
] as const

export const prospectSchema = z.object({
  business_name: z.string().trim().min(1, 'Business name is required').max(200),
  industry: z.string().trim().max(120),
  city: z.string().trim().max(120),
  state: z.string().trim().max(120),
  country: z.string().trim().max(120),
  website: z.string().trim().max(300),
  business_size: z.string().trim().max(80),
  contact_person: z.string().trim().max(150),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
  phone: z.string().trim().max(40),
  source: z.string().trim().min(1, 'Source is required').max(80),
  assigned_to: z.string(),
  notes: z.string().trim().max(4000),
})

export type ProspectFormValues = z.infer<typeof prospectSchema>

export const savedSearchSchema = z.object({
  name: z.string().trim().min(1, 'Search name is required').max(120),
  industry: z.string().trim().max(120),
  city: z.string().trim().max(120),
  state: z.string().trim().max(120),
  country: z.string().trim().max(120),
  business_size: z.string().trim().max(80),
  keywords: z.string().trim().max(300),
})

export type SavedSearchFormValues = z.infer<typeof savedSearchSchema>

export function emptyProspectForm(source = 'manual'): ProspectFormValues {
  return {
    business_name: '',
    industry: '',
    city: '',
    state: '',
    country: '',
    website: '',
    business_size: '',
    contact_person: '',
    email: '',
    phone: '',
    source,
    assigned_to: '',
    notes: '',
  }
}

export function emptySavedSearchForm(): SavedSearchFormValues {
  return {
    name: '',
    industry: '',
    city: '',
    state: '',
    country: '',
    business_size: '',
    keywords: '',
  }
}
