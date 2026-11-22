import { requireSupabase } from '@/integrations/supabase/client'
import type {
  GrowthCampaignRow,
  GrowthCreativeRow,
  GrowthFeedbackRow,
  GrowthReviewRow,
  GrowthSiteRow,
  GrowthSubmissionRow,
} from '@/types/database'
import type {
  CampaignFormValues,
  CreativeFormValues,
  FeedbackFormValues,
  ReviewFormValues,
  ReviewUpdateValues,
  SiteFormValues,
  SubmissionFormValues,
} from './schemas'

/**
 * Growth data access. Every read is tenant scoped; every write goes through a
 * trusted RPC. No provider call, send action or delivery metric exists here.
 */

export async function fetchGrowthCampaigns(tenantId: string): Promise<GrowthCampaignRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('growth_campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchGrowthCreatives(tenantId: string, campaignId?: string): Promise<GrowthCreativeRow[]> {
  const supabase = requireSupabase()
  let query = supabase.from('growth_creatives').select('*').eq('tenant_id', tenantId)
  if (campaignId) query = query.eq('campaign_id', campaignId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchGrowthWebsites(tenantId: string): Promise<GrowthSiteRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('growth_websites')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchGrowthSubmissions(tenantId: string, websiteId?: string): Promise<GrowthSubmissionRow[]> {
  const supabase = requireSupabase()
  let query = supabase.from('growth_form_submissions').select('*').eq('tenant_id', tenantId)
  if (websiteId) query = query.eq('website_id', websiteId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchGrowthReviews(tenantId: string): Promise<GrowthReviewRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('growth_reviews')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchGrowthFeedback(tenantId: string): Promise<GrowthFeedbackRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('growth_feedback')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

function requireRpcId(data: unknown, label: string): string {
  if (typeof data !== 'string' || !data) throw new Error(`The ${label} could not be created.`)
  return data
}

// Campaigns ----------------------------------------------------------------

export async function createGrowthCampaign(tenantId: string, values: CampaignFormValues): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('growth_create_campaign', {
    p_tenant: tenantId,
    p_name: values.name,
    p_channel: values.channel,
    p_objective: values.objective,
    p_status: values.status,
    p_starts_on: values.starts_on,
    p_ends_on: values.ends_on,
    p_notes: values.notes,
  })
  if (error) throw error
  return requireRpcId(data, 'campaign')
}

export async function updateGrowthCampaign(
  tenantId: string,
  campaignId: string,
  values: CampaignFormValues,
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_update_campaign', {
    p_tenant: tenantId,
    p_campaign: campaignId,
    p_name: values.name,
    p_channel: values.channel,
    p_objective: values.objective,
    p_status: values.status,
    p_starts_on: values.starts_on,
    p_ends_on: values.ends_on,
    p_notes: values.notes,
  })
  if (error) throw error
}

export async function deleteGrowthCampaign(tenantId: string, campaignId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_delete_campaign', {
    p_tenant: tenantId,
    p_campaign: campaignId,
  })
  if (error) throw error
}

// Marketing creatives -------------------------------------------------------

export async function createGrowthCreative(tenantId: string, values: CreativeFormValues): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('growth_create_creative', {
    p_tenant: tenantId,
    p_campaign: values.campaign_id,
    p_name: values.name,
    p_channel: values.channel,
    p_headline: values.headline,
    p_message: values.message,
    p_cta: values.cta,
    p_status: values.status,
  })
  if (error) throw error
  return requireRpcId(data, 'creative')
}

export async function updateGrowthCreative(
  tenantId: string,
  creativeId: string,
  values: CreativeFormValues,
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_update_creative', {
    p_tenant: tenantId,
    p_creative: creativeId,
    p_name: values.name,
    p_channel: values.channel,
    p_headline: values.headline,
    p_message: values.message,
    p_cta: values.cta,
    p_status: values.status,
  })
  if (error) throw error
}

export async function deleteGrowthCreative(tenantId: string, creativeId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_delete_creative', {
    p_tenant: tenantId,
    p_creative: creativeId,
  })
  if (error) throw error
}

// Websites and manual form submissions -------------------------------------

export async function createGrowthSite(tenantId: string, values: SiteFormValues): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('growth_create_site', {
    p_tenant: tenantId,
    p_name: values.name,
    p_slug: values.slug,
    p_domain: values.domain,
    p_status: values.status,
    p_notes: values.notes,
  })
  if (error) throw error
  return requireRpcId(data, 'website')
}

export async function updateGrowthSite(tenantId: string, siteId: string, values: SiteFormValues): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_update_site', {
    p_tenant: tenantId,
    p_site: siteId,
    p_name: values.name,
    p_slug: values.slug,
    p_domain: values.domain,
    p_status: values.status,
    p_notes: values.notes,
  })
  if (error) throw error
}

export async function deleteGrowthSite(tenantId: string, siteId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_delete_site', {
    p_tenant: tenantId,
    p_site: siteId,
  })
  if (error) throw error
}

export async function recordGrowthSubmission(tenantId: string, values: SubmissionFormValues): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('growth_record_submission', {
    p_tenant: tenantId,
    p_site: values.website_id,
    p_full_name: values.full_name,
    p_email: values.email,
    p_message: values.message,
    p_status: values.status,
  })
  if (error) throw error
  return requireRpcId(data, 'submission')
}

export async function updateGrowthSubmission(
  tenantId: string,
  submissionId: string,
  status: SubmissionFormValues['status'],
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_update_submission', {
    p_tenant: tenantId,
    p_submission: submissionId,
    p_status: status,
  })
  if (error) throw error
}

export async function deleteGrowthSubmission(tenantId: string, submissionId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_delete_submission', {
    p_tenant: tenantId,
    p_submission: submissionId,
  })
  if (error) throw error
}

// Reviews and feedback ------------------------------------------------------

export async function recordGrowthReview(tenantId: string, values: ReviewFormValues): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('growth_record_review', {
    p_tenant: tenantId,
    p_source: values.source,
    p_author: values.author,
    p_rating: values.rating,
    p_title: values.title,
    p_body: values.body,
    p_review_date: values.review_date,
    p_status: values.status,
  })
  if (error) throw error
  return requireRpcId(data, 'review')
}

/**
 * Deliberately does not send `responded_by`. The RPC stamps it with auth.uid(),
 * so a client cannot claim that someone else answered a review.
 */
export async function updateGrowthReview(tenantId: string, values: ReviewUpdateValues): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_update_review', {
    p_tenant: tenantId,
    p_review: values.review_id,
    p_status: values.status,
    p_response: values.response,
  })
  if (error) throw error
}

export async function deleteGrowthReview(tenantId: string, reviewId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_delete_review', {
    p_tenant: tenantId,
    p_review: reviewId,
  })
  if (error) throw error
}

export async function recordGrowthFeedback(tenantId: string, values: FeedbackFormValues): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('growth_record_feedback', {
    p_tenant: tenantId,
    p_source: values.source,
    p_customer: values.customer,
    p_rating: values.rating,
    p_comment: values.comment,
    p_status: values.status,
  })
  if (error) throw error
  return requireRpcId(data, 'feedback entry')
}

export async function updateGrowthFeedback(
  tenantId: string,
  feedbackId: string,
  status: FeedbackFormValues['status'],
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_update_feedback', {
    p_tenant: tenantId,
    p_feedback: feedbackId,
    p_status: status,
  })
  if (error) throw error
}

export async function deleteGrowthFeedback(tenantId: string, feedbackId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('growth_delete_feedback', {
    p_tenant: tenantId,
    p_feedback: feedbackId,
  })
  if (error) throw error
}
