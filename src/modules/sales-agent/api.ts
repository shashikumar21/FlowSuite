import { requireSupabase } from '@/integrations/supabase/client'
import type {
  Json,
  MemberStatus,
  ProspectRow,
  ProspectSearchRow,
  SalesAgentMetrics,
  SalesImportResult,
  SalesLeadStatus,
  TenantRole,
} from '@/types/database'
import type { ProspectFormValues, SavedSearchFormValues } from './schemas'
import type { ProspectImportRow } from './types'
import { EMPTY_SALES_METRICS } from './utils'

export type SalesMemberOption = {
  user_id: string
  role: TenantRole
  status: MemberStatus
  profiles: { full_name: string | null } | null
}

/** Active members for the assignment dropdown. Read-only under RLS. */
export async function fetchSalesMembers(tenantId: string): Promise<SalesMemberOption[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('business_members')
    .select('user_id, role, status, profiles(full_name)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .returns<SalesMemberOption[]>()
  if (error) throw error
  return data ?? []
}

/** Real counts from real tables. An empty shape is merged for safety only. */
export async function fetchSalesMetrics(tenantId: string): Promise<SalesAgentMetrics> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_dashboard_metrics', { p_tenant: tenantId })
  if (error) throw error
  return { ...EMPTY_SALES_METRICS, ...(data ?? {}) }
}

export async function fetchProspects(tenantId: string): Promise<ProspectRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchProspectSearches(tenantId: string): Promise<ProspectSearchRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('prospect_searches')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Server-side duplicate check. The unique indexes remain the backstop. */
export async function findDuplicateProspect(
  tenantId: string,
  values: Pick<ProspectFormValues, 'business_name' | 'city' | 'country' | 'website' | 'email'>,
): Promise<string | null> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_find_duplicate_prospect', {
    p_tenant: tenantId,
    p_email: values.email || null,
    p_website: values.website || null,
    p_business_name: values.business_name,
    p_city: values.city || null,
    p_country: values.country || null,
  })
  if (error) throw error
  return data ?? null
}

export async function createProspect(tenantId: string, values: ProspectFormValues): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_create_prospect', {
    p_tenant: tenantId,
    p_business_name: values.business_name,
    p_industry: values.industry || null,
    p_city: values.city || null,
    p_state: values.state || null,
    p_country: values.country || null,
    p_website: values.website || null,
    p_business_size: values.business_size || null,
    p_contact_person: values.contact_person || null,
    p_email: values.email || null,
    p_phone: values.phone || null,
    p_source: values.source,
    p_source_reference: null,
    p_assigned_to: values.assigned_to || null,
    p_notes: values.notes || null,
  })
  if (error) throw error
  if (!data) throw new Error('The prospect could not be created.')
  return data
}

export async function updateProspect(
  tenantId: string,
  prospectId: string,
  values: ProspectFormValues,
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_update_prospect', {
    p_tenant: tenantId,
    p_prospect: prospectId,
    p_business_name: values.business_name,
    p_industry: values.industry || null,
    p_city: values.city || null,
    p_state: values.state || null,
    p_country: values.country || null,
    p_website: values.website || null,
    p_business_size: values.business_size || null,
    p_contact_person: values.contact_person || null,
    p_email: values.email || null,
    p_phone: values.phone || null,
    p_assigned_to: values.assigned_to || null,
    p_notes: values.notes || null,
  })
  if (error) throw error
}

export async function setProspectLeadStatus(
  tenantId: string,
  prospectId: string,
  status: SalesLeadStatus,
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_set_prospect_lead_status', {
    p_tenant: tenantId,
    p_prospect: prospectId,
    p_status: status,
  })
  if (error) throw error
}

/** Convert a prospect into a CRM contact. Idempotent and duplicate-safe on the server. */
export async function convertProspectToContact(tenantId: string, prospectId: string): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_convert_prospect_to_contact', {
    p_tenant: tenantId,
    p_prospect: prospectId,
  })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('The conversion did not return a contact.')
  return data
}

export async function deleteProspect(tenantId: string, prospectId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_delete_prospect', {
    p_tenant: tenantId,
    p_prospect: prospectId,
  })
  if (error) throw error
}

export async function saveProspectSearch(
  tenantId: string,
  values: SavedSearchFormValues,
  searchId?: string | null,
): Promise<string> {
  const supabase = requireSupabase()
  // Criteria are recorded for future provider use. No provider is called and
  // result_count stays 0 in Phase 2 — nothing is fabricated.
  const criteria: Json = {
    industry: values.industry,
    city: values.city,
    state: values.state,
    country: values.country,
    business_size: values.business_size,
    keywords: values.keywords,
  }
  const { data, error } = await supabase.rpc('sales_save_search', {
    p_tenant: tenantId,
    p_name: values.name,
    p_criteria: criteria,
    p_provider: 'manual',
    p_search: searchId ?? null,
  })
  if (error) throw error
  if (!data) throw new Error('The search could not be saved.')
  return data
}

export async function importProspects(
  tenantId: string,
  rows: ProspectImportRow[],
  source = 'csv_import',
): Promise<SalesImportResult> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_import_prospects', {
    p_tenant: tenantId,
    p_rows: rows as unknown as Json,
    p_source: source,
  })
  if (error) throw error
  if (!data) throw new Error('The import returned no result.')
  return data
}
