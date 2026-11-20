import { requireSupabase } from '@/integrations/supabase/client'
import type { ActivityFormValues, ContactFormValues, DealFormValues } from './schemas'
import { EMPTY_METRICS } from './utils'
import type {
  ContactActivityRow,
  ContactRow,
  ContactSearchRow,
  CrmMetrics,
  CustomFieldRow,
  DealRow,
  LeadSourceRow,
  PipelineRow,
  StageRow,
  TagRow,
  TenantRole,
} from '@/types/database'

export type CrmSettings = {
  pipelines: PipelineRow[]
  stages: StageRow[]
  sources: LeadSourceRow[]
  tags: TagRow[]
  customFields: CustomFieldRow[]
}

export type MemberOption = {
  user_id: string
  full_name: string | null
  role: TenantRole
}

export type CrmOptions = {
  sources: LeadSourceRow[]
  tags: TagRow[]
  pipelines: PipelineRow[]
  stages: StageRow[]
  members: MemberOption[]
}

export type ContactFilters = {
  query?: string
  status?: string
  leadStatus?: string
  sourceId?: string
  assignedTo?: string
  tagId?: string
  limit?: number
  offset?: number
}

export type DealWithContact = DealRow & {
  contacts: { first_name: string; last_name: string | null; company: string | null } | null
}

export type ContactDetail = {
  contact: ContactRow
  activities: ContactActivityRow[]
  tagIds: string[]
}

function firstError(...results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null
}

/** Tenant-scoped configuration needed by every CRM screen. */
export async function fetchCrmOptions(tenantId: string): Promise<CrmOptions> {
  const supabase = requireSupabase()
  const [sources, tags, pipelines, stages, members] = await Promise.all([
    supabase
      .from('lead_sources')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .order('position')
      .returns<LeadSourceRow[]>(),
    supabase.from('tags').select('*').eq('tenant_id', tenantId).order('name').returns<TagRow[]>(),
    supabase
      .from('pipelines')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('position')
      .returns<PipelineRow[]>(),
    supabase.from('pipeline_stages').select('*').eq('tenant_id', tenantId).order('position').returns<StageRow[]>(),
    supabase
      .from('business_members')
      .select('user_id, role, profiles(full_name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .returns<Array<{ user_id: string; role: TenantRole; profiles: { full_name: string | null } | null }>>(),
  ])
  const error = firstError(sources, tags, pipelines, stages, members)
  if (error) throw error

  return {
    sources: sources.data ?? [],
    tags: tags.data ?? [],
    pipelines: pipelines.data ?? [],
    stages: stages.data ?? [],
    members: (members.data ?? []).map((member) => ({
      user_id: member.user_id,
      full_name: member.profiles?.full_name ?? null,
      role: member.role,
    })),
  }
}

/** Search is executed by a SECURITY DEFINER RPC that re-checks membership. */
export async function fetchContacts(
  tenantId: string,
  filters: ContactFilters,
): Promise<{ rows: ContactSearchRow[]; total: number }> {
  const { data, error } = await requireSupabase().rpc('crm_search_contacts', {
    p_tenant: tenantId,
    p_query: filters.query || null,
    p_status: filters.status || null,
    p_lead_status: filters.leadStatus || null,
    p_source_id: filters.sourceId || null,
    p_assigned_to: filters.assignedTo || null,
    p_tag_id: filters.tagId || null,
    p_limit: filters.limit ?? 20,
    p_offset: filters.offset ?? 0,
  })
  if (error) throw error
  return { rows: data ?? [], total: Number(data?.[0]?.total_count ?? 0) }
}

export async function fetchContactDetail(tenantId: string, contactId: string): Promise<ContactDetail> {
  const supabase = requireSupabase()
  const [contact, activities, tagLinks] = await Promise.all([
    supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', contactId)
      .maybeSingle()
      .returns<ContactRow | null>(),
    supabase
      .from('contact_activities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .order('occurred_at', { ascending: false })
      .limit(50)
      .returns<ContactActivityRow[]>(),
    supabase
      .from('contact_tags')
      .select('tag_id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .returns<Array<{ tag_id: string }>>(),
  ])
  const error = firstError(contact, activities, tagLinks)
  if (error) throw error
  if (!contact.data) throw new Error('This contact is no longer available.')

  return {
    contact: contact.data,
    activities: activities.data ?? [],
    tagIds: (tagLinks.data ?? []).map((link) => link.tag_id),
  }
}

export async function fetchDeals(tenantId: string): Promise<DealWithContact[]> {
  const { data, error } = await requireSupabase()
    .from('deals')
    .select('*, contacts(first_name, last_name, company)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .returns<DealWithContact[]>()
  if (error) throw error
  return data ?? []
}

export async function fetchMetrics(tenantId: string): Promise<CrmMetrics> {
  const { data, error } = await requireSupabase().rpc('crm_dashboard_metrics', { p_tenant: tenantId })
  if (error) throw error
  // The RPC returns `{}` when the caller has no access to the tenant. Merge it
  // with the empty shape so array consumers never receive undefined fields.
  return { ...EMPTY_METRICS, ...((data ?? {}) as Partial<CrmMetrics>) }
}

export async function createContact(tenantId: string, values: ContactFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_contact', {
    p_tenant: tenantId,
    p_first_name: values.first_name,
    p_last_name: values.last_name || null,
    p_email: values.email || null,
    p_phone: values.phone || null,
    p_company: values.company || null,
    p_source_id: values.source_id || null,
    p_notes: values.notes || null,
    p_assigned_to: values.assigned_to || null,
    p_lead_status: values.lead_status,
    p_clinic: values.clinic.trim() || null,
    p_area: values.area.trim() || null,
    p_mobile: values.mobile.trim() || null,
    p_rating: values.rating.trim() === '' ? null : Number(values.rating),
    p_reviews: values.reviews.trim() === '' ? null : Number(values.reviews),
    p_why_included: values.why_included.trim() || null,
    p_google_maps_url: values.google_maps_url.trim() || null,
    p_sent: values.sent,
    p_reply_1: values.reply_1.trim() || null,
  })
  if (error) throw error
  return data
}

export async function updateContact(
  tenantId: string,
  contactId: string,
  values: ContactFormValues,
): Promise<void> {
  const { error } = await requireSupabase().rpc('update_contact', {
    p_tenant: tenantId,
    p_contact: contactId,
    p_first_name: values.first_name,
    p_last_name: values.last_name || null,
    p_email: values.email || null,
    p_phone: values.phone || null,
    p_company: values.company || null,
    p_notes: values.notes || null,
    p_lead_status: values.lead_status,
    p_status: values.status,
    p_follow_up_at: values.follow_up_at ? new Date(values.follow_up_at).toISOString() : null,
    p_clinic: values.clinic.trim() || null,
    p_area: values.area.trim() || null,
    p_mobile: values.mobile.trim() || null,
    p_rating: values.rating.trim() === '' ? null : Number(values.rating),
    p_reviews: values.reviews.trim() === '' ? null : Number(values.reviews),
    p_why_included: values.why_included.trim() || null,
    p_google_maps_url: values.google_maps_url.trim() || null,
    p_sent: values.sent,
    p_reply_1: values.reply_1.trim() || null,
  })
  if (error) throw error
}

export async function archiveContact(tenantId: string, contactId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('archive_contact', { p_tenant: tenantId, p_contact: contactId })
  if (error) throw error
}

export async function claimLead(tenantId: string, contactId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('claim_lead', { p_tenant: tenantId, p_contact: contactId })
  if (error) throw error
}

export async function assignContact(tenantId: string, contactId: string, userId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('assign_contact', {
    p_tenant: tenantId,
    p_contact: contactId,
    p_user_id: userId,
  })
  if (error) throw error
}

export async function createDeal(tenantId: string, values: DealFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_deal', {
    p_tenant: tenantId,
    p_contact: values.contact_id,
    p_pipeline_id: values.pipeline_id,
    p_stage_id: values.stage_id,
    p_title: values.title,
    p_value: values.value,
    p_currency: values.currency,
    p_assigned_to: values.assigned_to || null,
    p_expected_close_date: values.expected_close_date || null,
    p_description: values.description || null,
  })
  if (error) throw error
  return data
}

export async function moveDealStage(tenantId: string, dealId: string, stageId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('move_deal_stage', {
    p_tenant: tenantId,
    p_deal: dealId,
    p_stage_id: stageId,
  })
  if (error) throw error
}

export async function assignDeal(tenantId: string, dealId: string, userId: string | null): Promise<void> {
  const { error } = await requireSupabase().rpc('assign_deal', {
    p_tenant: tenantId,
    p_deal: dealId,
    p_user_id: userId,
  })
  if (error) throw error
}

export async function convertLeadToDeal(tenantId: string, contactId: string, values: DealFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('convert_lead_to_deal', {
    p_tenant: tenantId,
    p_contact: contactId,
    p_pipeline_id: values.pipeline_id,
    p_stage_id: values.stage_id,
    p_title: values.title,
    p_value: values.value,
    p_currency: values.currency,
    p_assigned_to: values.assigned_to || null,
    p_expected_close_date: values.expected_close_date || null,
  })
  if (error) throw error
  return data
}

export async function addActivity(
  tenantId: string,
  contactId: string,
  values: ActivityFormValues,
): Promise<void> {
  const { error } = await requireSupabase().rpc('add_contact_activity', {
    p_tenant: tenantId,
    p_contact: contactId,
    p_type: values.type,
    p_subject: values.subject || values.type,
    p_body: values.body,
  })
  if (error) throw error
}

export async function createPipeline(
  tenantId: string,
  values: { name: string; description?: string; color?: string },
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_pipeline', {
    p_tenant: tenantId,
    p_name: values.name,
    p_description: values.description || null,
    p_color: values.color || null,
  })
  if (error) throw error
  return data
}

export async function createPipelineStage(
  tenantId: string,
  pipelineId: string,
  values: { name: string; probability: number; is_closed: boolean; is_won: boolean; color?: string },
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_pipeline_stage', {
    p_tenant: tenantId,
    p_pipeline_id: pipelineId,
    p_name: values.name,
    p_probability: values.probability,
    p_is_closed: values.is_closed,
    p_is_won: values.is_won,
    p_color: values.color || null,
  })
  if (error) throw error
  return data
}

export async function createTag(tenantId: string, name: string, color: string | null): Promise<string> {
  const { data, error } = await requireSupabase()
    .from('tags')
    .insert({ tenant_id: tenantId, name, color: color || null })
    .select('id')
    .single()
    .returns<{ id: string }>()
  if (error) throw error
  return data.id
}

export async function deleteTag(tenantId: string, tagId: string): Promise<void> {
  const { error } = await requireSupabase().from('tags').delete().eq('tenant_id', tenantId).eq('id', tagId)
  if (error) throw error
}

export async function attachTag(tenantId: string, contactId: string, tagId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('contact_tags')
    .upsert(
      { tenant_id: tenantId, contact_id: contactId, tag_id: tagId },
      { onConflict: 'tenant_id,contact_id,tag_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

export async function detachTag(tenantId: string, contactId: string, tagId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('contact_tags')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)
    .eq('tag_id', tagId)
  if (error) throw error
}

export async function createLeadSource(
  tenantId: string,
  values: { name: string; type: LeadSourceRow['type'] },
): Promise<string> {
  const { data, error } = await requireSupabase()
    .from('lead_sources')
    .insert({ tenant_id: tenantId, name: values.name, type: values.type })
    .select('id')
    .single()
    .returns<{ id: string }>()
  if (error) throw error
  return data.id
}

/** Settings reads everything, including inactive records hidden from normal forms. */
export async function fetchCrmSettings(tenantId: string): Promise<CrmSettings> {
  const supabase = requireSupabase()
  const [pipelines, stages, sources, tags, customFields] = await Promise.all([
    supabase
      .from('pipelines')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('position')
      .returns<PipelineRow[]>(),
    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('position')
      .returns<StageRow[]>(),
    supabase
      .from('lead_sources')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('position')
      .returns<LeadSourceRow[]>(),
    supabase.from('tags').select('*').eq('tenant_id', tenantId).order('name').returns<TagRow[]>(),
    supabase
      .from('custom_fields')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('position')
      .returns<CustomFieldRow[]>(),
  ])
  const error = firstError(pipelines, stages, sources, tags, customFields)
  if (error) throw error

  return {
    pipelines: pipelines.data ?? [],
    stages: stages.data ?? [],
    sources: sources.data ?? [],
    tags: tags.data ?? [],
    customFields: customFields.data ?? [],
  }
}

export async function setLeadSourceActive(tenantId: string, id: string, active: boolean): Promise<void> {
  const { error } = await requireSupabase()
    .from('lead_sources')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id)
  if (error) throw error
}

export async function deleteLeadSource(tenantId: string, id: string): Promise<void> {
  const { error } = await requireSupabase().from('lead_sources').delete().eq('tenant_id', tenantId).eq('id', id)
  if (error) throw error
}

export async function createCustomField(
  tenantId: string,
  values: { entity_type: CustomFieldRow['entity_type']; key: string; label: string; type: CustomFieldRow['type'] },
): Promise<string> {
  const { data, error } = await requireSupabase()
    .from('custom_fields')
    .insert({ tenant_id: tenantId, ...values })
    .select('id')
    .single()
    .returns<{ id: string }>()
  if (error) throw error
  return data.id
}

export async function deleteCustomField(tenantId: string, id: string): Promise<void> {
  const { error } = await requireSupabase().from('custom_fields').delete().eq('tenant_id', tenantId).eq('id', id)
  if (error) throw error
}
