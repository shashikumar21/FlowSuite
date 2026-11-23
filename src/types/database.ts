/**
 * Hand-written until `supabase gen types typescript` is run against a real
 * project. Keep in sync with supabase/migrations/*.sql.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Table<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type TenantRole = 'owner' | 'admin' | 'manager' | 'employee'
export type MemberStatus = 'invited' | 'active' | 'suspended'

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'unqualified' | 'converted'
export type ContactStatus = 'lead' | 'customer' | 'inactive'
export type DealStatus = 'open' | 'won' | 'lost'
export type ActivityType =
  | 'note'
  | 'call'
  | 'email'
  | 'meeting'
  | 'task'
  | 'status_change'
  | 'stage_change'
  | 'assignment'
  | 'lead_created'
  | 'deal_created'

export type ProfileRow = {
  id: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  locale: string
  created_at: string
  updated_at: string
}

export type BusinessRow = {
  id: string
  name: string
  slug: string
  industry: string
  email: string | null
  phone: string | null
  website: string | null
  country_code: string
  currency: string
  timezone: string
  status: 'active' | 'suspended' | 'deleted'
  created_at: string
  updated_at: string
}

type MemberRow = {
  id: string
  tenant_id: string
  user_id: string
  role: TenantRole
  status: MemberStatus
  created_at: string
}

export type InvitationRow = {
  id: string
  tenant_id: string
  email: string
  role: Exclude<TenantRole, 'owner'>
  token: string
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export type PlanRow = {
  id: string
  name: string
  description: string | null
  price_monthly: number
  price_yearly: number
  limits: Json
  features: Json
  active: boolean
  created_at: string
}

type SubscriptionRow = {
  id: string
  tenant_id: string
  plan_id: string
  provider: string
  provider_subscription_id: string | null
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'
  current_period_start: string | null
  current_period_end: string | null
  created_at: string
}

type AuditRow = {
  id: number
  tenant_id: string | null
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Json
  created_at: string
}

export type ContactRow = {
  id: string
  tenant_id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  company: string | null
  notes: string | null
  source: string | null
  source_id: string | null
  status: ContactStatus
  lead_status: LeadStatus
  lead_score: number
  assigned_to: string | null
  follow_up_at: string | null
  last_contacted_at: string | null
  converted_at: string | null
  custom_data: Json
  /** Set only on records created by a confirmed import-as-new job. */
  import_allow_duplicate: boolean
  created_at: string
  updated_at: string
  clinic: string | null
  area: string | null
  mobile: string | null
  rating: number | null
  reviews: number | null
  why_included: string | null
  google_maps_url: string | null
  sent: boolean
  reply_1: string | null
}

export type PipelineRow = {
  id: string
  tenant_id: string
  name: string
  is_default: boolean
  description: string | null
  color: string | null
  position: number
  is_active: boolean
  created_at: string
}

export type StageRow = {
  id: string
  tenant_id: string
  pipeline_id: string
  name: string
  position: number
  probability: number
  is_closed: boolean
  is_won: boolean
  color: string | null
  slug: string | null
}

export type DealRow = {
  id: string
  tenant_id: string
  contact_id: string
  pipeline_id: string
  stage_id: string
  title: string
  value: number
  currency: string
  assigned_to: string | null
  status: DealStatus
  expected_close_date: string | null
  description: string | null
  probability: number
  custom_data: Json
  won_at: string | null
  lost_at: string | null
  lost_reason: string | null
  created_at: string
  updated_at: string
}

export type LeadSourceRow = {
  id: string
  tenant_id: string
  name: string
  type: 'website' | 'whatsapp' | 'referral' | 'walk_in' | 'advertisement' | 'manual' | 'other'
  active: boolean
  position: number
  created_at: string
  updated_at: string
}

export type TagRow = {
  id: string
  tenant_id: string
  name: string
  color: string | null
  created_at: string
  updated_at: string
}

export type ContactTagRow = {
  tenant_id: string
  contact_id: string
  tag_id: string
  created_at: string
}

export type ContactActivityRow = {
  id: string
  tenant_id: string
  contact_id: string
  deal_id: string | null
  type: ActivityType
  subject: string | null
  body: string | null
  occurred_at: string
  created_by: string | null
  metadata: Json
  created_at: string
}

export type DealAssignmentRow = {
  id: string
  tenant_id: string
  deal_id: string
  user_id: string
  assigned_by: string | null
  created_at: string
}

export type CustomFieldRow = {
  id: string
  tenant_id: string
  entity_type: 'contact' | 'lead' | 'deal'
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean'
  options: Json
  required: boolean
  active: boolean
  position: number
  created_at: string
  updated_at: string
}

/** Row returned by the tenant-scoped `crm_search_contacts` RPC. */
export type ContactSearchRow = {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  company: string | null
  status: ContactStatus
  lead_status: LeadStatus
  source_id: string | null
  assigned_to: string | null
  created_at: string
  total_count: number
  clinic: string | null
  area: string | null
  mobile: string | null
  rating: number | null
  reviews: number | null
  why_included: string | null
  google_maps_url: string | null
  sent: boolean
  reply_1: string | null
}

/** Shape returned by the tenant-scoped `crm_dashboard_metrics` RPC. */
export type CrmMetrics = {
  total_contacts: number
  new_leads: number
  qualified_leads: number
  open_deals: number
  won_deals: number
  open_pipeline_value: number
  leads_by_source: Array<{ label: string; count: number }>
  deals_by_stage: Array<{ stage: string; count: number; value: number; position: number }>
  recent_activities: Array<{
    id: string
    type: ActivityType
    subject: string | null
    body: string | null
    contact_id: string
    deal_id: string | null
    occurred_at: string
    created_at: string
  }>
}

export type AppointmentStatus =
  | 'pending'
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export type AppointmentRow = {
  id: string
  tenant_id: string
  contact_id: string | null
  service_id: string | null
  resource_id: string | null
  booking_page_id: string | null
  title: string
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  booking_source: 'staff' | 'public_booking' | 'import' | 'api'
  notes: string | null
  start_at: string
  end_at: string
  status: AppointmentStatus
  assigned_to: string | null
  idempotency_key: string | null
  manage_token: string | null
  rescheduled_from: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  confirmed_at: string | null
  completed_at: string | null
  metadata: Json
  created_at: string
  updated_at: string
}

export type ConversationStatus = 'open' | 'closed' | 'pending'

export type ConversationRow = {
  id: string
  tenant_id: string
  contact_id: string | null
  channel: string
  channel_id: string | null
  subject: string | null
  status: ConversationStatus
  priority: 'low' | 'normal' | 'high' | 'urgent'
  unread_count: number
  assigned_to: string | null
  customer_name: string | null
  customer_email: string | null
  ai_status: 'active' | 'paused' | 'handed_off' | 'closed'
  ai_handed_off_at: string | null
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export type MessageRow = {
  id: string
  tenant_id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  message_type: 'text' | 'image' | 'file' | 'system' | 'email' | 'whatsapp'
  content: string | null
  provider_message_id: string | null
  delivery_status: string
  author_id: string | null
  author_type: 'staff' | 'customer' | 'system' | 'bot'
  ai_generated: boolean
  is_internal: boolean
  delivered_at: string | null
  read_at: string | null
  metadata: Json
  created_at: string
  updated_at: string
}

export type ServiceRow = {
  id: string
  tenant_id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
  currency: string
  buffer_before_minutes: number
  buffer_after_minutes: number
  active: boolean
  created_at: string
  updated_at: string
}

export type BookingResourceRow = {
  id: string
  tenant_id: string
  name: string
  kind: 'employee' | 'room' | 'equipment'
  member_user_id: string | null
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type ServiceResourceRow = {
  tenant_id: string
  service_id: string
  resource_id: string
  created_at: string
}

export type AvailabilityRuleRow = {
  id: string
  tenant_id: string
  resource_id: string | null
  /** PostgreSQL DOW: 0 = Sunday ... 6 = Saturday. */
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  created_at: string
  updated_at: string
}

export type AvailabilityExceptionRow = {
  id: string
  tenant_id: string
  resource_id: string | null
  exception_type: 'blocked' | 'available' | 'break'
  title: string | null
  start_at: string
  end_at: string
  all_day: boolean
  created_at: string
  updated_at: string
}

export type BookingPageRow = {
  id: string
  tenant_id: string
  slug: string
  title: string
  description: string | null
  primary_color: string | null
  logo_url: string | null
  lead_time_minutes: number
  booking_horizon_days: number
  slot_interval_minutes: number
  require_email: boolean
  require_phone: boolean
  allow_cancellation: boolean
  allow_rescheduling: boolean
  cancellation_hours: number
  active: boolean
  created_at: string
  updated_at: string
}

export type BookingPageServiceRow = {
  tenant_id: string
  booking_page_id: string
  service_id: string
  created_at: string
}

export type AppointmentEventRow = {
  id: string
  tenant_id: string
  appointment_id: string
  event_type:
    | 'created'
    | 'confirmed'
    | 'rescheduled'
    | 'cancelled'
    | 'completed'
    | 'no_show'
    | 'assigned'
    | 'note'
    | 'status_changed'
  from_status: string | null
  to_status: string | null
  actor_id: string | null
  actor_type: 'staff' | 'customer' | 'system'
  metadata: Json
  created_at: string
}

export type ChannelRow = {
  id: string
  tenant_id: string
  name: string
  channel_type:
    | 'internal'
    | 'email'
    | 'whatsapp'
    | 'website_chat'
    | 'sms'
    | 'instagram'
    | 'other'
  identifier: string | null
  status: 'connected' | 'disconnected' | 'error'
  config: Json
  active: boolean
  created_at: string
  updated_at: string
}

export type WebhookEventRow = {
  id: string
  tenant_id: string | null
  provider: string
  event_type: string
  external_id: string
  payload: Json
  status: 'received' | 'processed' | 'failed' | 'ignored'
  error: string | null
  signature_verified: boolean
  attempts: number
  last_attempt_at: string | null
  received_at: string
  processed_at: string | null
}

/* Milestone 4 — AI communication. Provider-facing rows are written by
   service-role Edge Functions only; browser code uses the trusted RPCs. */
export type AiLanguage = 'en' | 'hi' | 'te'
export type AiTone = 'friendly' | 'professional' | 'conversational'
export type AiResponseStyle = 'short' | 'detailed'
export type AiAgentStatus = 'draft' | 'active' | 'paused'
export type AiToolKey =
  | 'answer_faq'
  | 'qualify_lead'
  | 'lookup_services'
  | 'lookup_hours'
  | 'lookup_availability'
  | 'create_booking'
  | 'create_lead'
  | 'check_consent'
  | 'send_reply'
  | 'handoff'
export type AiClassification =
  | 'information_request'
  | 'high_intent'
  | 'future_follow_up'
  | 'not_interested'
  | 'unknown'
export type AiChannel = 'website_chat' | 'whatsapp' | 'voice' | 'internal'
export type AiOperation = 'chat' | 'qualify' | 'embed' | 'tts' | 'stt' | 'tool'
export type AiConsentStatus = 'opt_in' | 'opt_out'
export type AiConsentChannel = 'whatsapp' | 'sms' | 'email' | 'voice'
export type AiFollowUpChannel = 'whatsapp' | 'sms' | 'email'
export type AiFollowUpJobStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'skipped'
  | 'failed'
  | 'cancelled'
export type AiCallStatus = 'ringing' | 'in_progress' | 'completed' | 'failed' | 'no_answer'

export type AiAgentRow = {
  id: string
  tenant_id: string
  name: string
  language: AiLanguage
  tone: AiTone
  business_info: string | null
  working_hours: Json
  permissions: Json
  booking_permission: boolean
  handoff_user_id: string | null
  response_style: AiResponseStyle
  monthly_token_limit: number | null
  status: AiAgentStatus
  public_key: string
  created_at: string
  updated_at: string
}

export type AiKnowledgeRow = {
  id: string
  tenant_id: string
  agent_id: string
  category:
    | 'business_profile'
    | 'service'
    | 'faq'
    | 'opening_hours'
    | 'booking_policy'
    | 'contact'
    | 'other'
  title: string
  content: string
  language: AiLanguage
  active: boolean
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type AiAgentToolRow = {
  id: string
  tenant_id: string
  agent_id: string
  tool_key: AiToolKey
  enabled: boolean
  requires_confirmation: boolean
  config: Json
  created_at: string
  updated_at: string
}

export type ChannelCredentialRow = {
  id: string
  tenant_id: string
  channel_id: string
  provider: 'whatsapp' | 'openai' | 'resend' | 'exotel' | 'netlify' | 'vercel' | 'other'
  /** Server-side secret reference name only; never a raw token. */
  secret_ref: string
  external_identifier: string | null
  status: 'active' | 'disconnected' | 'error'
  scopes: Json
  last_verified_at: string | null
  created_at: string
  updated_at: string
}

export type MessageTemplateRow = {
  id: string
  tenant_id: string
  provider: 'whatsapp' | 'sms' | 'email' | 'other'
  template_key: string
  provider_template_name: string | null
  language: AiLanguage
  category:
    | 'acknowledgement'
    | 'appointment_confirmation'
    | 'reminder'
    | 'follow_up'
    | 'utility'
    | 'marketing'
  content: string
  status: 'draft' | 'approved' | 'rejected'
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type CommunicationConsentRow = {
  id: string
  tenant_id: string
  contact_id: string
  channel: AiConsentChannel
  status: AiConsentStatus
  source: 'website_chat' | 'whatsapp' | 'manual' | 'import' | 'staff' | 'booking'
  proof: Json
  consented_at: string
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type ConversationHandoffRow = {
  id: string
  tenant_id: string
  conversation_id: string
  from_user_id: string | null
  to_user_id: string
  reason: string | null
  note: string | null
  status: 'pending' | 'accepted' | 'completed' | 'reverted'
  created_at: string
  accepted_at: string | null
  completed_at: string | null
}

export type AiLeadAssessmentRow = {
  id: string
  tenant_id: string
  contact_id: string
  conversation_id: string | null
  message_id: string | null
  classification: AiClassification
  intent: string | null
  summary: string
  service_interest: string | null
  follow_up_recommendation: string | null
  provider: string
  model: string | null
  created_at: string
}

export type AiUsageLogRow = {
  id: string
  tenant_id: string
  agent_id: string | null
  conversation_id: string | null
  channel: AiChannel
  provider: string
  model: string | null
  operation: AiOperation
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost: number
  latency_ms: number | null
  success: boolean
  error_code: string | null
  request_id: string | null
  created_at: string
}

export type AiFollowUpSequenceRow = {
  id: string
  tenant_id: string
  name: string
  channel: AiFollowUpChannel
  status: 'draft' | 'active' | 'paused'
  created_at: string
  updated_at: string
}

export type AiFollowUpStepRow = {
  id: string
  tenant_id: string
  sequence_id: string
  step_index: number
  delay_minutes: number
  template_key: string
  condition: 'no_reply' | 'always' | 'unqualified_only'
  active: boolean
  created_at: string
  updated_at: string
}

export type AiFollowUpJobRow = {
  id: string
  tenant_id: string
  contact_id: string
  conversation_id: string | null
  sequence_id: string
  step_id: string
  channel: AiFollowUpChannel
  status: AiFollowUpJobStatus
  due_at: string
  attempts: number
  idempotency_key: string
  consent_status: AiConsentStatus | null
  provider_message_id: string | null
  last_error: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
}

export type AiCallSessionRow = {
  id: string
  tenant_id: string
  provider: string
  provider_call_id: string
  direction: 'inbound' | 'outbound'
  from_number: string | null
  to_number: string | null
  status: AiCallStatus
  contact_id: string | null
  conversation_id: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  metadata: Json
  created_at: string
  updated_at: string
}

export type AiCallLogRow = {
  id: string
  tenant_id: string
  session_id: string
  outcome: string | null
  summary: string | null
  duration_seconds: number | null
  usage: Json
  error: string | null
  created_at: string
}

export type PublicAiAgent = {
  agent_id: string
  name: string
  language: AiLanguage
  tone: AiTone
  response_style: AiResponseStyle
  business_info: string | null
  business_name: string | null
  booking_permission: boolean
  booking_slug: string | null
  knowledge: Array<{ category: string; title: string; content: string }>
  tools: AiToolKey[]
}

export type AiWebhookEventResult = { id: string; is_duplicate: boolean }
export type AiLatestAssessment = {
  id?: string
  classification?: AiClassification
  intent?: string | null
  summary?: string
  service_interest?: string | null
  follow_up_recommendation?: string | null
  provider?: string
  model?: string | null
  created_at?: string
}

export type AiFollowUpJobPayload = {
  job_id: string
  tenant_id: string
  contact_id: string
  conversation_id: string | null
  channel: AiFollowUpChannel
  idempotency_key: string
  attempt: number
  contact_name: string | null
  contact_phone: string | null
  contact_mobile: string | null
  contact_email: string | null
  template: {
    key: string
    provider_name: string | null
    content: string
    language: AiLanguage
  } | null
}

export type NotificationRow = {
  id: string
  tenant_id: string
  user_id: string
  notification_type:
    | 'appointment_new'
    | 'appointment_confirmed'
    | 'appointment_cancelled'
    | 'appointment_rescheduled'
    | 'appointment_upcoming'
    | 'conversation_assigned'
    | 'message_received'
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  delivery_channel: 'in_app' | 'email'
  delivery_status: 'pending' | 'sent' | 'failed' | 'skipped'
  read_at: string | null
  created_at: string
}

/** A slot returned by booking_compute_slots / public_booking_get_slots. */
export type BookingSlot = {
  start: string
  end: string
  resource_id: string
}

export type PublicBookingService = {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
  currency: string
}

/** Empty when the slug is inactive or online booking is disabled. */
export type PublicBookingPage = {
  slug: string
  business_name: string
  business_timezone: string
  currency: string
  title: string
  description: string | null
  primary_color: string | null
  logo_url: string | null
  require_email: boolean
  require_phone: boolean
  allow_cancellation: boolean
  allow_rescheduling: boolean
  booking_horizon_days: number
  lead_time_minutes: number
  services: PublicBookingService[]
}

export type PublicBookingResult = {
  id: string
  manage_token: string
  status: AppointmentStatus
  start_at: string
  end_at: string
  service_name: string
  customer_name: string
}

export type PublicBookingManageResult = {
  id: string
  status: AppointmentStatus
  start_at?: string
}

export type BookingMetrics = {
  today_count: number
  upcoming_count: number
  pending_count: number
  completed_count: number
  cancelled_count: number
  no_show_count: number
  week_count: number
}

export type InboxMetrics = {
  open_count: number
  pending_count: number
  closed_count: number
  unassigned_count: number
}

export type NotificationsResult = {
  items: NotificationRow[]
  total_count: number
}

/* Tasks — local-only 0022. The actor/completion fields are optional because
   the hosted project still has the original 0001 table shape. */
export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type TaskRow = {
  id: string
  tenant_id: string
  title: string
  description: string | null
  assigned_to: string | null
  due_at: string | null
  status: TaskStatus
  created_at: string
  updated_at: string
  created_by?: string | null
  completed_by?: string | null
  completed_at?: string | null
}

export type IndustryTemplateRow = {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  configuration_json: Json
  active: boolean
  created_at: string
}

type BusinessSettingsRow = {
  tenant_id: string
  enable_online_bookings: boolean
  enable_whatsapp: boolean
  default_locale: string
  currency: string
  timezone: string
  business_hours: Json
  metadata: Json
  updated_at: string
}

type BranchRow = {
  id: string
  tenant_id: string
  name: string
  address: string | null
  phone: string | null
  is_primary: boolean
  timezone: string
  created_at: string
  updated_at: string
}

export type ContactImportJobRow = {
  id: string
  tenant_id: string
  created_by: string | null
  kind: 'contacts' | 'leads'
  file_name: string
  file_size: number
  file_hash: string
  duplicate_mode: 'skip' | 'update' | 'new'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  total_rows: number
  processed_rows: number
  created_count: number
  updated_count: number
  skipped_count: number
  failed_count: number
  confirmed_new_duplicates: boolean
  error_report: Json
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export type ContactImportBatchRow = {
  job_id: string
  batch_index: number
  row_count: number
  results: Json
  created_at: string
}

export type CrmExportRow = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  status: ContactStatus
  lead_status: LeadStatus
  source_name: string
  owner_name: string
  tags: string
  notes: string
  custom_data: Json
  created_at: string
  clinic: string | null
  area: string | null
  mobile: string | null
  rating: number | null
  reviews: number | null
  why_included: string | null
  google_maps_url: string | null
  sent: boolean
  reply_1: string | null
}

// ---------------------------------------------------------------------------
// AI Sales Agent (migration 0017). Browser access is SELECT-only; every write
// goes through the trusted sales_* RPCs listed in Functions below.
// ---------------------------------------------------------------------------

export type SalesVerificationStatus = 'unverified' | 'pending' | 'verified' | 'invalid' | 'unknown'
export type SalesLeadStatus = 'new' | 'contacted' | 'qualified' | 'unqualified' | 'converted'

export type ProspectSearchRow = {
  id: string
  tenant_id: string
  created_by: string | null
  name: string
  criteria: Json
  provider: 'manual' | 'google_places' | 'other'
  result_count: number
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export type ProspectRow = {
  id: string
  tenant_id: string
  business_name: string
  industry: string | null
  city: string | null
  state: string | null
  country: string | null
  website: string | null
  business_size: string | null
  contact_person: string | null
  email: string | null
  phone: string | null
  source: string
  source_reference: string | null
  verification_status: SalesVerificationStatus
  lead_status: SalesLeadStatus
  assigned_to: string | null
  created_by: string | null
  notes: string | null
  custom_data: Json
  converted_at: string | null
  converted_contact_id: string | null
  attribution: Json
  created_at: string
  updated_at: string
}

export type DecisionMakerRow = {
  id: string
  tenant_id: string
  prospect_id: string
  full_name: string
  job_title: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  research_source: string | null
  verification_status: SalesVerificationStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ContactVerificationRow = {
  id: string
  tenant_id: string
  entity_type: 'prospect' | 'decision_maker'
  entity_id: string
  method: 'manual' | 'provider'
  status: SalesVerificationStatus
  provider: string | null
  checked_by: string | null
  checked_at: string
  evidence: Json
}

export type ProspectSignalRow = {
  id: string
  tenant_id: string
  prospect_id: string
  signal_type: 'note' | 'website' | 'news' | 'referral' | 'other'
  summary: string
  source_url: string | null
  recorded_by: string | null
  created_at: string
}

export type OutreachCampaignRow = {
  id: string
  tenant_id: string
  name: string
  status:
    | 'draft'
    | 'pending_approval'
    | 'approved'
    | 'rejected'
    | 'active'
    | 'paused'
    | 'completed'
    | 'cancelled'
  subject: string | null
  body: string | null
  tone: string | null
  objective: string | null
  /** Added by 0019_phase3_email_outreach.sql. */
  product_offered: string | null
  problem_addressed: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_reason: string | null
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type OutreachMessageRow = {
  id: string
  tenant_id: string
  campaign_id: string
  prospect_id: string
  recipient_email: string | null
  subject: string
  body: string
  status:
    | 'draft'
    | 'pending_approval'
    | 'approved'
    | 'rejected'
    | 'queued'
    | 'sent'
    | 'failed'
    | 'cancelled'
  /** Added by 0019_phase3_email_outreach.sql. */
  decision_maker_id: string | null
  opening: string | null
  cta: string | null
  follow_up_subject: string | null
  follow_up_body: string | null
  generation_source: 'manual' | 'ai'
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_reason: string | null
  provider_message_id: string | null
  created_at: string
  updated_at: string
}

export type OutreachOutboxRow = {
  id: string
  tenant_id: string
  message_id: string
  prospect_id: string
  recipient_email: string
  status: 'queued' | 'processing' | 'sent' | 'skipped' | 'failed' | 'cancelled'
  idempotency_key: string
  provider: string | null
  provider_message_id: string | null
  attempts: number
  last_error: string | null
  queued_at: string
  sent_at: string | null
  created_at: string
  updated_at: string
}

export type OutreachReplyRow = {
  id: string
  tenant_id: string
  message_id: string | null
  campaign_id: string | null
  prospect_id: string
  sender_email: string | null
  subject: string | null
  body: string | null
  reply_status: 'unread' | 'read' | 'archived'
  classification: 'interested' | 'not_interested' | 'follow_up_required' | 'unsubscribe' | 'unknown'
  provider: string
  external_id: string | null
  received_at: string
  created_at: string
}

export type SuppressionRow = {
  id: string
  tenant_id: string
  email: string
  reason: 'unsubscribe' | 'bounced' | 'complaint' | 'manual'
  source: string | null
  created_by: string | null
  created_at: string
}

/** Read-only approval decision history added by 0019. */
export type SalesEmailApprovalRow = {
  id: string
  tenant_id: string
  campaign_id: string
  message_id: string
  decision: 'approved' | 'rejected'
  actor_id: string | null
  edited_subject: string | null
  edited_body: string | null
  reason: string | null
  created_at: string
}

/** Shape returned by the tenant-scoped `sales_dashboard_metrics` RPC. */
export type SalesAgentMetrics = {
  total_prospects: number
  new_prospects: number
  verified_contacts: number
  active_campaigns: number
  emails_sent: number
  replies_received: number
  interested_prospects: number
  converted_customers: number
  saved_searches: number
}

/** Shape returned by `sales_create_campaign`. Counts are real inserted rows. */
export type SalesCampaignCreateResult = {
  campaign_id: string
  recipients_created: number
  skipped_no_email: number
  skipped_suppressed: number
}

/** Real counts from outreach_messages, aggregated server-side by RPC. */
export type SalesCampaignSummary = {
  recipients: number
  drafts: number
  pending_approval: number
  approved: number
  rejected: number
  queued: number
  sent: number
  failed: number
}

/** Shape returned by the tenant-scoped `sales_import_prospects` RPC. */
export type SalesImportResult = {
  total: number
  created: number
  skipped_duplicate: number
  failed: number
  results: Array<{
    row: number
    business_name: string | null
    status: 'created' | 'duplicate' | 'failed'
    reason?: string | null
    id?: string | null
  }>
}

/* Growth — local-only 0021. SELECT-only for browser code; writes via RPCs. */
export type GrowthChannel = 'whatsapp' | 'sms' | 'ads' | 'social' | 'email' | 'other'
export type GrowthCampaignStatus = 'draft' | 'planned' | 'active' | 'paused' | 'completed' | 'cancelled'
export type GrowthCreativeStatus = 'draft' | 'ready' | 'used' | 'archived'
export type GrowthSiteStatus = 'draft' | 'published' | 'archived'
export type GrowthSubmissionStatus = 'new' | 'reviewed' | 'archived'
export type GrowthReviewStatus = 'new' | 'reviewed' | 'responded' | 'archived'
export type GrowthReviewSource = 'google' | 'facebook' | 'website' | 'other'
export type GrowthFeedbackSource = 'in_person' | 'website' | 'whatsapp' | 'other'

export type GrowthCampaignRow = {
  id: string
  tenant_id: string
  name: string
  channel: GrowthChannel
  objective: string
  status: GrowthCampaignStatus
  starts_on: string | null
  ends_on: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type GrowthCreativeRow = {
  id: string
  tenant_id: string
  campaign_id: string
  name: string
  channel: GrowthChannel
  headline: string | null
  message: string
  cta: string | null
  status: GrowthCreativeStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export type GrowthSiteRow = {
  id: string
  tenant_id: string
  name: string
  slug: string
  domain: string | null
  status: GrowthSiteStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type GrowthSubmissionRow = {
  id: string
  tenant_id: string
  website_id: string
  full_name: string
  email: string
  message: string | null
  status: GrowthSubmissionStatus
  recorded_by: string | null
  created_at: string
  updated_at: string
}

export type GrowthReviewRow = {
  id: string
  tenant_id: string
  source: GrowthReviewSource
  author: string
  rating: number
  title: string | null
  body: string | null
  review_date: string | null
  status: GrowthReviewStatus
  response: string | null
  responded_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type GrowthFeedbackRow = {
  id: string
  tenant_id: string
  source: GrowthFeedbackSource
  customer: string
  rating: number
  comment: string | null
  status: GrowthSubmissionStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void'
export type InvoicePaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other'

export type InvoiceRow = {
  id: string
  tenant_id: string
  contact_id: string | null
  invoice_number: string
  title: string
  status: InvoiceStatus
  currency: string
  issue_date: string
  due_date: string | null
  line_items: Json
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  amount_paid: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type InvoicePaymentRow = {
  id: string
  tenant_id: string
  invoice_id: string
  amount: number
  method: InvoicePaymentMethod
  reference: string | null
  paid_at: string
  notes: string | null
  created_by: string | null
  created_at: string
}

export type VoiceAgentStatus = 'draft' | 'active' | 'paused' | 'archived'
export type VoiceAgentDirection = 'inbound' | 'outbound' | 'both'
export type VoiceBookingMode = 'lead_capture' | 'booking_assist' | 'disabled'
export type VoiceProvider = 'none' | 'exotel' | 'twilio' | 'other'
export type CallSessionDirection = 'inbound' | 'outbound'
export type CallSessionStatus = 'logged' | 'queued' | 'ringing' | 'in_progress' | 'completed' | 'missed' | 'failed' | 'cancelled'
export type CallSessionProvider = 'manual' | 'exotel' | 'twilio' | 'other'
export type CallTranscriptSpeaker = 'caller' | 'agent' | 'staff' | 'system'
export type CallHandoffStatus = 'open' | 'assigned' | 'resolved' | 'cancelled'

export type VoiceAgentRow = {
  id: string
  tenant_id: string
  name: string
  status: VoiceAgentStatus
  direction: VoiceAgentDirection
  languages: string[]
  greeting: string | null
  faq_summary: string | null
  booking_mode: VoiceBookingMode
  handoff_phone: string | null
  provider: VoiceProvider
  provider_phone_number: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CallSessionRow = {
  id: string
  tenant_id: string
  agent_id: string | null
  contact_id: string | null
  direction: CallSessionDirection
  status: CallSessionStatus
  provider: CallSessionProvider
  provider_call_id: string | null
  from_number: string | null
  to_number: string | null
  language: string | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  outcome: string | null
  summary: string | null
  consent_recording: boolean
  needs_handoff: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CallTranscriptRow = {
  id: string
  tenant_id: string
  call_session_id: string
  speaker: CallTranscriptSpeaker
  message: string
  language: string | null
  occurred_at: string
  created_at: string
}

export type CallEventRow = {
  id: string
  tenant_id: string
  call_session_id: string
  event_type: string
  payload: Json
  created_by: string | null
  created_at: string
}

export type CallHandoffRow = {
  id: string
  tenant_id: string
  call_session_id: string
  reason: string
  status: CallHandoffStatus
  assigned_to: string | null
  notes: string | null
  resolved_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Pick<ProfileRow, 'id'> & Partial<ProfileRow>, Partial<ProfileRow>>
      businesses: Table<
        BusinessRow,
        Pick<BusinessRow, 'name' | 'slug' | 'industry'> & Partial<BusinessRow>,
        Partial<BusinessRow>
      >
      business_members: Table<
        MemberRow,
        Pick<MemberRow, 'tenant_id' | 'user_id'> & Partial<MemberRow>,
        Partial<MemberRow>
      >
      business_invitations: Table<
        InvitationRow,
        Pick<InvitationRow, 'tenant_id' | 'email' | 'role'> & Partial<InvitationRow>,
        Partial<InvitationRow>
      >
      platform_admins: Table<
        { user_id: string; role: 'super_admin' | 'support'; created_at: string },
        { user_id: string; role: 'super_admin' | 'support'; created_at?: string },
        { role?: 'super_admin' | 'support' }
      >
      plans: Table<PlanRow, Partial<PlanRow> & { name: string }, Partial<PlanRow>>
      subscriptions: Table<
        SubscriptionRow,
        Pick<SubscriptionRow, 'tenant_id' | 'plan_id'> & Partial<SubscriptionRow>,
        Partial<SubscriptionRow>
      >
      audit_logs: Table<AuditRow, Partial<AuditRow>, Partial<AuditRow>>
      contacts: Table<
        ContactRow,
        Pick<ContactRow, 'tenant_id' | 'first_name'> & Partial<ContactRow>,
        Partial<ContactRow>
      >
      pipelines: Table<
        PipelineRow,
        Pick<PipelineRow, 'tenant_id' | 'name'> & Partial<PipelineRow>,
        Partial<PipelineRow>
      >
      pipeline_stages: Table<
        StageRow,
        Pick<StageRow, 'tenant_id' | 'pipeline_id' | 'name'> & Partial<StageRow>,
        Partial<StageRow>
      >
      deals: Table<
        DealRow,
        Pick<DealRow, 'tenant_id' | 'contact_id' | 'pipeline_id' | 'stage_id' | 'title'> & Partial<DealRow>,
        Partial<DealRow>
      >
      appointments: Table<
        AppointmentRow,
        Pick<AppointmentRow, 'tenant_id' | 'title' | 'start_at' | 'end_at'> & Partial<AppointmentRow>,
        Partial<AppointmentRow>
      >
      conversations: Table<
        ConversationRow,
        Pick<ConversationRow, 'tenant_id' | 'channel'> & Partial<ConversationRow>,
        Partial<ConversationRow>
      >
      messages: Table<
        MessageRow,
        Pick<MessageRow, 'tenant_id' | 'conversation_id' | 'direction'> & Partial<MessageRow>,
        Partial<MessageRow>
      >
      tasks: Table<
        TaskRow,
        Pick<TaskRow, 'tenant_id' | 'title'> & Partial<TaskRow>,
        Partial<TaskRow>
      >
      industry_templates: Table<
        IndustryTemplateRow,
        Partial<IndustryTemplateRow> & { name: string; slug: string },
        Partial<IndustryTemplateRow>
      >
      template_modules: Table<
        { id: string; template_id: string; module_key: string; enabled: boolean; configuration_json: Json },
        { id?: string; template_id: string; module_key: string; enabled?: boolean; configuration_json?: Json },
        { enabled?: boolean; configuration_json?: Json }
      >
      business_settings: Table<
        BusinessSettingsRow,
        Pick<BusinessSettingsRow, 'tenant_id'> & Partial<BusinessSettingsRow>,
        Partial<BusinessSettingsRow>
      >
      branches: Table<
        BranchRow,
        Pick<BranchRow, 'tenant_id' | 'name'> & Partial<BranchRow>,
        Partial<BranchRow>
      >
      business_template_settings: Table<
        { tenant_id: string; template_id: string; overrides_json: Json; applied_at: string },
        { tenant_id: string; template_id: string; overrides_json?: Json; applied_at?: string },
        { template_id?: string; overrides_json?: Json; applied_at?: string }
      >
      lead_sources: Table<
        LeadSourceRow,
        Pick<LeadSourceRow, 'tenant_id' | 'name'> & Partial<LeadSourceRow>,
        Partial<LeadSourceRow>
      >
      tags: Table<TagRow, Pick<TagRow, 'tenant_id' | 'name'> & Partial<TagRow>, Partial<TagRow>>
      contact_tags: Table<
        ContactTagRow,
        Pick<ContactTagRow, 'tenant_id' | 'contact_id' | 'tag_id'> & Partial<ContactTagRow>,
        Partial<ContactTagRow>
      >
      contact_activities: Table<
        ContactActivityRow,
        Pick<ContactActivityRow, 'tenant_id' | 'contact_id' | 'type'> & Partial<ContactActivityRow>,
        Partial<ContactActivityRow>
      >
      deal_assignments: Table<
        DealAssignmentRow,
        Pick<DealAssignmentRow, 'tenant_id' | 'deal_id' | 'user_id'> & Partial<DealAssignmentRow>,
        Partial<DealAssignmentRow>
      >
      custom_fields: Table<
        CustomFieldRow,
        Pick<CustomFieldRow, 'tenant_id' | 'entity_type' | 'key' | 'label' | 'type'> & Partial<CustomFieldRow>,
        Partial<CustomFieldRow>
      >
      contact_import_jobs: Table<
        ContactImportJobRow,
        Pick<
          ContactImportJobRow,
          'tenant_id' | 'kind' | 'file_name' | 'file_size' | 'file_hash' | 'duplicate_mode' | 'total_rows'
        > &
          Partial<ContactImportJobRow>,
        Partial<ContactImportJobRow>
      >
      contact_import_batches: Table<
        ContactImportBatchRow,
        Pick<ContactImportBatchRow, 'job_id' | 'batch_index'> & Partial<ContactImportBatchRow>,
        Partial<ContactImportBatchRow>
      >

      /* Milestone 3 — booking and communication. Direct client access is
         RLS-scoped; configuration changes should use the trusted RPCs below. */
      services: Table<
        ServiceRow,
        Pick<ServiceRow, 'tenant_id' | 'name'> & Partial<ServiceRow>,
        Partial<ServiceRow>
      >
      booking_resources: Table<
        BookingResourceRow,
        Pick<BookingResourceRow, 'tenant_id' | 'name'> & Partial<BookingResourceRow>,
        Partial<BookingResourceRow>
      >
      service_resources: Table<
        ServiceResourceRow,
        Pick<ServiceResourceRow, 'service_id' | 'resource_id'> & Partial<ServiceResourceRow>,
        Partial<ServiceResourceRow>
      >
      availability_rules: Table<
        AvailabilityRuleRow,
        Pick<AvailabilityRuleRow, 'tenant_id' | 'day_of_week' | 'start_time' | 'end_time'> &
          Partial<AvailabilityRuleRow>,
        Partial<AvailabilityRuleRow>
      >
      availability_exceptions: Table<
        AvailabilityExceptionRow,
        Pick<AvailabilityExceptionRow, 'tenant_id' | 'start_at' | 'end_at'> &
          Partial<AvailabilityExceptionRow>,
        Partial<AvailabilityExceptionRow>
      >
      booking_pages: Table<
        BookingPageRow,
        Pick<BookingPageRow, 'tenant_id' | 'slug'> & Partial<BookingPageRow>,
        Partial<BookingPageRow>
      >
      booking_page_services: Table<
        BookingPageServiceRow,
        Pick<BookingPageServiceRow, 'booking_page_id' | 'service_id'> &
          Partial<BookingPageServiceRow>,
        Partial<BookingPageServiceRow>
      >
      appointment_events: Table<
        AppointmentEventRow,
        Pick<AppointmentEventRow, 'tenant_id' | 'appointment_id' | 'event_type'> &
          Partial<AppointmentEventRow>,
        Partial<AppointmentEventRow>
      >
      channels: Table<
        ChannelRow,
        Pick<ChannelRow, 'tenant_id' | 'name'> & Partial<ChannelRow>,
        Partial<ChannelRow>
      >
      webhook_events: Table<
        WebhookEventRow,
        Pick<WebhookEventRow, 'provider' | 'event_type' | 'external_id'> & Partial<WebhookEventRow>,
        Partial<WebhookEventRow>
      >
      notifications: Table<
        NotificationRow,
        Pick<NotificationRow, 'tenant_id' | 'user_id' | 'notification_type' | 'title'> &
          Partial<NotificationRow>,
        Partial<NotificationRow>
      >

      /* Milestone 4 — AI communication. Direct writes are RLS-scoped; use the
         trusted RPCs below for configuration and provider ingestion. */
      ai_agents: Table<
        AiAgentRow,
        Pick<AiAgentRow, 'tenant_id' | 'name'> & Partial<AiAgentRow>,
        Partial<AiAgentRow>
      >
      ai_agent_knowledge: Table<
        AiKnowledgeRow,
        Pick<AiKnowledgeRow, 'tenant_id' | 'agent_id' | 'category' | 'title' | 'content'> &
          Partial<AiKnowledgeRow>,
        Partial<AiKnowledgeRow>
      >
      ai_agent_tools: Table<
        AiAgentToolRow,
        Pick<AiAgentToolRow, 'tenant_id' | 'agent_id' | 'tool_key'> & Partial<AiAgentToolRow>,
        Partial<AiAgentToolRow>
      >
      channel_credentials: Table<
        ChannelCredentialRow,
        Pick<ChannelCredentialRow, 'tenant_id' | 'channel_id' | 'provider' | 'secret_ref'> &
          Partial<ChannelCredentialRow>,
        Partial<ChannelCredentialRow>
      >
      message_templates: Table<
        MessageTemplateRow,
        Pick<MessageTemplateRow, 'tenant_id' | 'template_key' | 'content'> & Partial<MessageTemplateRow>,
        Partial<MessageTemplateRow>
      >
      communication_consents: Table<
        CommunicationConsentRow,
        Pick<CommunicationConsentRow, 'tenant_id' | 'contact_id' | 'channel' | 'status' | 'source'> &
          Partial<CommunicationConsentRow>,
        Partial<CommunicationConsentRow>
      >
      conversation_handoffs: Table<
        ConversationHandoffRow,
        Pick<ConversationHandoffRow, 'tenant_id' | 'conversation_id' | 'to_user_id'> &
          Partial<ConversationHandoffRow>,
        Partial<ConversationHandoffRow>
      >
      ai_lead_assessments: Table<
        AiLeadAssessmentRow,
        Pick<AiLeadAssessmentRow, 'tenant_id' | 'contact_id' | 'classification' | 'summary'> &
          Partial<AiLeadAssessmentRow>,
        Partial<AiLeadAssessmentRow>
      >
      ai_usage_logs: Table<
        AiUsageLogRow,
        Pick<AiUsageLogRow, 'tenant_id' | 'channel' | 'provider' | 'operation'> & Partial<AiUsageLogRow>,
        Partial<AiUsageLogRow>
      >
      ai_follow_up_sequences: Table<
        AiFollowUpSequenceRow,
        Pick<AiFollowUpSequenceRow, 'tenant_id' | 'name' | 'channel'> & Partial<AiFollowUpSequenceRow>,
        Partial<AiFollowUpSequenceRow>
      >
      ai_follow_up_steps: Table<
        AiFollowUpStepRow,
        Pick<AiFollowUpStepRow, 'tenant_id' | 'sequence_id' | 'step_index' | 'template_key'> &
          Partial<AiFollowUpStepRow>,
        Partial<AiFollowUpStepRow>
      >
      ai_follow_up_jobs: Table<
        AiFollowUpJobRow,
        Pick<
          AiFollowUpJobRow,
          'tenant_id' | 'contact_id' | 'sequence_id' | 'step_id' | 'channel' | 'due_at' | 'idempotency_key'
        > &
          Partial<AiFollowUpJobRow>,
        Partial<AiFollowUpJobRow>
      >
      ai_call_sessions: Table<
        AiCallSessionRow,
        Pick<AiCallSessionRow, 'tenant_id' | 'provider' | 'provider_call_id'> & Partial<AiCallSessionRow>,
        Partial<AiCallSessionRow>
      >
      ai_call_logs: Table<
        AiCallLogRow,
        Pick<AiCallLogRow, 'tenant_id' | 'session_id'> & Partial<AiCallLogRow>,
        Partial<AiCallLogRow>
      >

      /* AI Sales Agent — SELECT-only for browser code. Writes go via RPCs. */
      prospect_searches: Table<ProspectSearchRow, Partial<ProspectSearchRow>, Partial<ProspectSearchRow>>
      prospects: Table<ProspectRow, Partial<ProspectRow>, Partial<ProspectRow>>
      decision_makers: Table<DecisionMakerRow, Partial<DecisionMakerRow>, Partial<DecisionMakerRow>>
      contact_verifications: Table<ContactVerificationRow, Partial<ContactVerificationRow>, Partial<ContactVerificationRow>>
      prospect_signals: Table<ProspectSignalRow, Partial<ProspectSignalRow>, Partial<ProspectSignalRow>>
      outreach_campaigns: Table<OutreachCampaignRow, Partial<OutreachCampaignRow>, Partial<OutreachCampaignRow>>
      outreach_messages: Table<OutreachMessageRow, Partial<OutreachMessageRow>, Partial<OutreachMessageRow>>
      outreach_outbox: Table<OutreachOutboxRow, Partial<OutreachOutboxRow>, Partial<OutreachOutboxRow>>
      outreach_replies: Table<OutreachReplyRow, Partial<OutreachReplyRow>, Partial<OutreachReplyRow>>
      suppression_list: Table<SuppressionRow, Partial<SuppressionRow>, Partial<SuppressionRow>>
      sales_email_approvals: Table<SalesEmailApprovalRow, Partial<SalesEmailApprovalRow>, Partial<SalesEmailApprovalRow>>

      /* Growth — SELECT-only for browser code. Writes go via trusted RPCs. */
      growth_campaigns: Table<GrowthCampaignRow, Partial<GrowthCampaignRow>, Partial<GrowthCampaignRow>>
      growth_creatives: Table<GrowthCreativeRow, Partial<GrowthCreativeRow>, Partial<GrowthCreativeRow>>
      growth_websites: Table<GrowthSiteRow, Partial<GrowthSiteRow>, Partial<GrowthSiteRow>>
      growth_form_submissions: Table<GrowthSubmissionRow, Partial<GrowthSubmissionRow>, Partial<GrowthSubmissionRow>>
      growth_reviews: Table<GrowthReviewRow, Partial<GrowthReviewRow>, Partial<GrowthReviewRow>>
      growth_feedback: Table<GrowthFeedbackRow, Partial<GrowthFeedbackRow>, Partial<GrowthFeedbackRow>>
      invoices: Table<InvoiceRow, Partial<InvoiceRow>, Partial<InvoiceRow>>
      invoice_payments: Table<InvoicePaymentRow, Partial<InvoicePaymentRow>, Partial<InvoicePaymentRow>>
      voice_agents: Table<VoiceAgentRow, Partial<VoiceAgentRow>, Partial<VoiceAgentRow>>
      call_sessions: Table<CallSessionRow, Partial<CallSessionRow>, Partial<CallSessionRow>>
      call_transcripts: Table<CallTranscriptRow, Partial<CallTranscriptRow>, Partial<CallTranscriptRow>>
      call_events: Table<CallEventRow, Partial<CallEventRow>, Partial<CallEventRow>>
      call_handoffs: Table<CallHandoffRow, Partial<CallHandoffRow>, Partial<CallHandoffRow>>
    }
    Views: Record<string, never>
    Functions: {
      create_business: {
        Args: {
          p_name: string
          p_slug: string
          p_industry: string
          p_email?: string | null
          p_phone?: string | null
          p_timezone?: string
          p_currency?: string
        }
        Returns: string
      }
      create_business_invitation: {
        Args: { p_tenant_id: string; p_email: string; p_role: Exclude<TenantRole, 'owner'> }
        Returns: string
      }
      accept_business_invitation: { Args: { p_token: string }; Returns: string }
      apply_industry_template: { Args: { p_tenant_id: string; p_template_slug: string }; Returns: undefined }
      has_tenant_access: { Args: { target_tenant: string }; Returns: boolean }
      has_tenant_role: { Args: { target_tenant: string; allowed_roles: string[] }; Returns: boolean }
      is_platform_admin: { Args: { allowed_roles?: string[] }; Returns: boolean }

      /* Milestone 2 — trusted CRM RPCs. RLS remains authoritative for direct
         table access; these functions re-check membership and permissions. */
      create_contact: {
        Args: {
          p_tenant: string
          p_first_name: string
          p_last_name?: string | null
          p_email?: string | null
          p_phone?: string | null
          p_company?: string | null
          p_source?: string | null
          p_source_id?: string | null
          p_notes?: string | null
          p_assigned_to?: string | null
          p_lead_status?: LeadStatus
          p_clinic?: string | null
          p_area?: string | null
          p_mobile?: string | null
          p_rating?: number | null
          p_reviews?: number | null
          p_why_included?: string | null
          p_google_maps_url?: string | null
          p_sent?: boolean
          p_reply_1?: string | null
        }
        Returns: string
      }
      update_contact: {
        Args: {
          p_tenant: string
          p_contact: string
          p_first_name: string
          p_last_name?: string | null
          p_email?: string | null
          p_phone?: string | null
          p_company?: string | null
          p_notes?: string | null
          p_lead_status?: LeadStatus | null
          p_follow_up_at?: string | null
          p_status?: ContactStatus | null
          p_clinic?: string | null
          p_area?: string | null
          p_mobile?: string | null
          p_rating?: number | null
          p_reviews?: number | null
          p_why_included?: string | null
          p_google_maps_url?: string | null
          p_sent?: boolean
          p_reply_1?: string | null
        }
        Returns: undefined
      }
      archive_contact: { Args: { p_tenant: string; p_contact: string }; Returns: undefined }
      claim_lead: { Args: { p_tenant: string; p_contact: string }; Returns: undefined }
      assign_contact: {
        Args: { p_tenant: string; p_contact: string; p_user_id: string }
        Returns: undefined
      }
      create_deal: {
        Args: {
          p_tenant: string
          p_contact: string
          p_pipeline_id: string
          p_stage_id: string
          p_title: string
          p_value?: number
          p_currency?: string
          p_assigned_to?: string | null
          p_expected_close_date?: string | null
          p_description?: string | null
        }
        Returns: string
      }
      move_deal_stage: {
        Args: { p_tenant: string; p_deal: string; p_stage_id: string }
        Returns: undefined
      }
      assign_deal: {
        Args: { p_tenant: string; p_deal: string; p_user_id: string | null }
        Returns: undefined
      }
      convert_lead_to_deal: {
        Args: {
          p_tenant: string
          p_contact: string
          p_pipeline_id: string
          p_stage_id: string
          p_title: string
          p_value?: number
          p_currency?: string
          p_assigned_to?: string | null
          p_expected_close_date?: string | null
        }
        Returns: string
      }
      add_contact_activity: {
        Args: {
          p_tenant: string
          p_contact: string
          p_type: ActivityType
          p_subject?: string | null
          p_body?: string | null
          p_deal_id?: string | null
          p_occurred_at?: string
        }
        Returns: string
      }
      create_pipeline: {
        Args: {
          p_tenant: string
          p_name: string
          p_description?: string | null
          p_color?: string | null
        }
        Returns: string
      }
      create_pipeline_stage: {
        Args: {
          p_tenant: string
          p_pipeline_id: string
          p_name: string
          p_probability?: number
          p_is_closed?: boolean
          p_is_won?: boolean
          p_color?: string | null
        }
        Returns: string
      }
      crm_search_contacts: {
        Args: {
          p_tenant: string
          p_query?: string | null
          p_status?: string | null
          p_lead_status?: string | null
          p_source_id?: string | null
          p_assigned_to?: string | null
          p_tag_id?: string | null
          p_limit?: number
          p_offset?: number
        }
        Returns: ContactSearchRow[]
      }
      crm_dashboard_metrics: { Args: { p_tenant: string }; Returns: CrmMetrics }

      /* Milestone 2 data exchange — tenant is always derived from membership. */
      crm_start_import: {
        Args: {
          p_tenant: string
          p_kind: string
          p_file_name: string
          p_file_size: number
          p_file_hash: string
          p_duplicate_mode: string
          p_total_rows: number
        }
        Returns: string
      }
      crm_check_import_duplicates: {
        Args: { p_tenant: string; p_rows: Json }
        Returns: Json
      }
      crm_confirm_import_duplicates: { Args: { p_job_id: string }; Returns: undefined }
      crm_process_import_batch: {
        Args: { p_job_id: string; p_batch_index: number; p_rows: Json }
        Returns: Json
      }
      crm_complete_import: {
        Args: { p_job_id: string; p_failed?: boolean }
        Returns: Json
      }
      crm_export_rows: {
        Args: {
          p_tenant: string
          p_kind: string
          p_query?: string | null
          p_status?: string | null
          p_lead_status?: string | null
          p_source_id?: string | null
          p_assigned_to?: string | null
          p_tag_id?: string | null
          p_limit?: number
        }
        Returns: CrmExportRow[]
      }

      /* Milestone 3 — booking. Configuration writes and status changes re-check
         tenant membership/role in the database; the browser is never trusted. */
      booking_compute_slots: {
        Args: {
          p_tenant: string
          p_service_id: string
          p_resource_id?: string | null
          p_date: string
          p_interval_minutes: number
          p_lead_time_minutes: number
          p_exclude_appointment?: string | null
        }
        Returns: BookingSlot[]
      }
      booking_create_service: {
        Args: {
          p_tenant: string
          p_name: string
          p_description?: string | null
          p_duration_minutes?: number
          p_price?: number
          p_currency?: string
          p_buffer_before_minutes?: number
          p_buffer_after_minutes?: number
          p_active?: boolean
        }
        Returns: string
      }
      booking_update_service: {
        Args: {
          p_tenant: string
          p_service: string
          p_name: string
          p_description?: string | null
          p_duration_minutes?: number
          p_price?: number
          p_currency?: string
          p_buffer_before_minutes?: number
          p_buffer_after_minutes?: number
          p_active?: boolean
        }
        Returns: undefined
      }
      booking_set_service_active: {
        Args: { p_tenant: string; p_service: string; p_active: boolean }
        Returns: undefined
      }
      booking_create_resource: {
        Args: {
          p_tenant: string
          p_name: string
          p_kind?: 'employee' | 'room' | 'equipment'
          p_member_user_id?: string | null
          p_notes?: string | null
          p_active?: boolean
        }
        Returns: string
      }
      booking_update_resource: {
        Args: {
          p_tenant: string
          p_resource: string
          p_name: string
          p_kind?: 'employee' | 'room' | 'equipment'
          p_member_user_id?: string | null
          p_notes?: string | null
          p_active?: boolean
        }
        Returns: undefined
      }
      booking_set_service_resources: {
        Args: { p_tenant: string; p_service: string; p_resource_ids: string[] }
        Returns: undefined
      }
      booking_upsert_availability_rule: {
        Args: {
          p_tenant: string
          p_rule?: string | null
          p_resource_id?: string | null
          p_day_of_week?: number
          p_start_time?: string
          p_end_time?: string
          p_is_active?: boolean
          p_valid_from?: string | null
          p_valid_until?: string | null
        }
        Returns: string
      }
      booking_delete_availability_rule: {
        Args: { p_tenant: string; p_rule: string }
        Returns: undefined
      }
      booking_create_exception: {
        Args: {
          p_tenant: string
          p_resource_id?: string | null
          p_exception_type?: 'blocked' | 'available' | 'break'
          p_title?: string | null
          p_start_at?: string | null
          p_end_at?: string | null
          p_all_day?: boolean
        }
        Returns: string
      }
      booking_delete_exception: {
        Args: { p_tenant: string; p_exception: string }
        Returns: undefined
      }
      booking_update_page_settings: {
        Args: {
          p_tenant: string
          p_booking_page: string
          p_title: string
          p_description?: string | null
          p_primary_color?: string | null
          p_logo_url?: string | null
          p_lead_time_minutes?: number
          p_booking_horizon_days?: number
          p_slot_interval_minutes?: number
          p_require_email?: boolean
          p_require_phone?: boolean
          p_allow_cancellation?: boolean
          p_allow_rescheduling?: boolean
          p_cancellation_hours?: number
          p_active?: boolean
          p_service_ids?: string[] | null
        }
        Returns: undefined
      }
      booking_dashboard_metrics: { Args: { p_tenant: string }; Returns: BookingMetrics }
      booking_set_status: {
        Args: {
          p_tenant: string
          p_appointment: string
          p_status: AppointmentStatus
          p_reason?: string | null
        }
        Returns: undefined
      }
      booking_reschedule: {
        Args: {
          p_tenant: string
          p_appointment: string
          p_start_at: string
          p_resource_id?: string | null
          p_reason?: string | null
        }
        Returns: undefined
      }
      booking_assign: {
        Args: {
          p_tenant: string
          p_appointment: string
          p_resource_id: string
          p_user_id?: string | null
        }
        Returns: undefined
      }
      booking_create_staff: {
        Args: {
          p_tenant: string
          p_service_id: string
          p_customer_name: string
          p_start_at: string
          p_resource_id?: string | null
          p_contact_id?: string | null
          p_customer_phone?: string | null
          p_customer_email?: string | null
          p_notes?: string | null
          p_idempotency_key?: string | null
        }
        Returns: string
      }

      /* Anonymous, slug/token-scoped booking RPCs. These are the only booking
         functions granted to the anon role. */
      public_booking_get_page: { Args: { p_slug: string }; Returns: PublicBookingPage }
      public_booking_get_slots: {
        Args: {
          p_slug: string
          p_service_id: string
          p_date: string
          p_resource_id?: string | null
        }
        Returns: BookingSlot[]
      }
      public_booking_create: {
        Args: {
          p_slug: string
          p_service_id: string
          p_start_at: string
          p_customer_name: string
          p_customer_phone: string
          p_customer_email?: string | null
          p_resource_id?: string | null
          p_notes?: string | null
          p_idempotency_key?: string | null
        }
        Returns: PublicBookingResult
      }
      public_booking_manage: {
        Args: {
          p_token: string
          p_action: 'cancel' | 'reschedule'
          p_start_at?: string | null
          p_reason?: string | null
        }
        Returns: PublicBookingManageResult
      }

      /* Milestone 3 — inbox and in-app notifications. */
      inbox_create_conversation: {
        Args: {
          p_tenant: string
          p_contact_id?: string | null
          p_channel_id?: string | null
          p_subject?: string | null
          p_customer_name?: string | null
          p_customer_email?: string | null
          p_assigned_to?: string | null
        }
        Returns: string
      }
      inbox_assign_conversation: {
        Args: { p_tenant: string; p_conversation: string; p_user_id: string }
        Returns: undefined
      }
      inbox_set_conversation_status: {
        Args: { p_tenant: string; p_conversation: string; p_status: ConversationStatus }
        Returns: undefined
      }
      inbox_send_message: {
        Args: {
          p_tenant: string
          p_conversation: string
          p_content: string
          p_message_type?: 'text' | 'image' | 'file' | 'system' | 'email' | 'whatsapp'
          p_is_internal?: boolean
          p_external_id?: string | null
        }
        Returns: string
      }
      inbox_mark_read: {
        Args: { p_tenant: string; p_conversation: string }
        Returns: undefined
      }
      inbox_metrics: { Args: { p_tenant: string }; Returns: InboxMetrics }
      inbox_record_webhook: {
        Args: {
          p_tenant: string
          p_provider: string
          p_event_type: string
          p_external_id: string
          p_payload: Json
        }
        Returns: boolean
      }
      notifications_list: {
        Args: { p_tenant: string; p_limit?: number; p_offset?: number }
        Returns: NotificationsResult
      }
      notifications_mark_read: {
        Args: { p_tenant: string; p_notification: string }
        Returns: undefined
      }
      notifications_mark_all_read: { Args: { p_tenant: string }; Returns: undefined }
      notifications_unread_count: { Args: { p_tenant: string }; Returns: number }

      /* Milestone 4 — AI communication. Member-facing configuration RPCs
         re-check membership/role in the database; provider-facing RPCs are
         service-role only and are called from Edge Functions, never the browser. */
      can_manage_ai: { Args: { p_tenant: string }; Returns: boolean }
      has_consent: {
        Args: { p_tenant: string; p_contact: string; p_channel: string }
        Returns: boolean
      }
      ai_upsert_agent: {
        Args: {
          p_tenant: string
          p_name: string
          p_language?: AiLanguage
          p_tone?: AiTone
          p_business_info?: string | null
          p_working_hours?: Json
          p_permissions?: Json
          p_booking_permission?: boolean
          p_handoff_user_id?: string | null
          p_response_style?: AiResponseStyle
          p_monthly_token_limit?: number | null
          p_status?: AiAgentStatus
          p_agent_id?: string | null
        }
        Returns: string
      }
      ai_set_agent_status: {
        Args: { p_tenant: string; p_agent: string; p_status: AiAgentStatus }
        Returns: undefined
      }
      ai_upsert_knowledge: {
        Args: {
          p_tenant: string
          p_agent: string
          p_category:
            | 'business_profile'
            | 'service'
            | 'faq'
            | 'opening_hours'
            | 'booking_policy'
            | 'contact'
            | 'other'
          p_title: string
          p_content: string
          p_language?: AiLanguage
          p_active?: boolean
          p_knowledge_id?: string | null
        }
        Returns: string
      }
      ai_set_tool: {
        Args: {
          p_tenant: string
          p_agent: string
          p_tool_key: AiToolKey
          p_enabled: boolean
          p_requires_confirmation?: boolean
          p_config?: Json
        }
        Returns: undefined
      }
      ai_upsert_credential: {
        Args: {
          p_tenant: string
          p_channel: string
          p_provider: 'whatsapp' | 'openai' | 'resend' | 'exotel' | 'netlify' | 'vercel' | 'other'
          /** Server-side secret reference name only; never a raw token. */
          p_secret_ref: string
          p_external_identifier?: string | null
          p_scopes?: Json
        }
        Returns: string
      }
      ai_upsert_template: {
        Args: {
          p_tenant: string
          p_template_key: string
          p_content: string
          p_provider?: 'whatsapp' | 'sms' | 'email' | 'other'
          p_provider_template_name?: string | null
          p_language?: AiLanguage
          p_category?:
            | 'acknowledgement'
            | 'appointment_confirmation'
            | 'reminder'
            | 'follow_up'
            | 'utility'
            | 'marketing'
          p_status?: 'draft' | 'approved' | 'rejected'
        }
        Returns: string
      }
      ai_set_consent: {
        Args: {
          p_tenant: string
          p_contact: string
          p_channel: AiConsentChannel
          p_status: AiConsentStatus
          p_source: 'website_chat' | 'whatsapp' | 'manual' | 'import' | 'staff' | 'booking'
          p_proof?: Json
        }
        Returns: string
      }
      ai_record_assessment: {
        Args: {
          p_tenant: string
          p_contact: string
          p_classification: AiClassification
          p_summary: string
          p_intent?: string | null
          p_service_interest?: string | null
          p_follow_up_recommendation?: string | null
          p_conversation?: string | null
          p_message?: string | null
          p_provider?: string
          p_model?: string | null
        }
        Returns: string
      }
      ai_latest_assessment: {
        Args: { p_tenant: string; p_contact: string }
        Returns: AiLatestAssessment
      }
      ai_handoff_conversation: {
        Args: {
          p_tenant: string
          p_conversation: string
          p_to_user: string
          p_reason?: string | null
          p_note?: string | null
        }
        Returns: string
      }
      ai_set_conversation_ai_status: {
        Args: { p_tenant: string; p_conversation: string; p_status: 'active' | 'paused' | 'closed' }
        Returns: undefined
      }
      ai_enqueue_follow_up: {
        Args: {
          p_tenant: string
          p_contact: string
          p_sequence: string
          p_channel: AiFollowUpChannel
          p_conversation?: string | null
        }
        Returns: string
      }
      ai_check_usage_limit: {
        Args: { p_tenant: string; p_agent: string }
        Returns: boolean
      }

      /* The only anon-callable AI RPC; returns approved public-safe config. */
      ai_get_public_agent: {
        Args: { p_public_key: string }
        Returns: PublicAiAgent | Record<string, never>
      }

      /* Service-role-only provider/worker RPCs. */
      ai_record_webhook_event: {
        Args: {
          p_tenant: string
          p_provider: string
          p_event_type: string
          p_external_id: string
          p_payload: Json
          p_signature_verified?: boolean
        }
        Returns: AiWebhookEventResult
      }
      ai_upsert_contact_from_channel: {
        Args: {
          p_tenant: string
          p_channel: string
          p_full_name?: string | null
          p_phone?: string | null
          p_email?: string | null
        }
        Returns: string
      }
      ai_find_or_create_conversation: {
        Args: { p_tenant: string; p_contact: string; p_channel: string }
        Returns: string
      }
      ai_append_message: {
        Args: {
          p_tenant: string
          p_conversation: string
          p_direction: 'inbound' | 'outbound'
          p_content: string
          p_author_type: 'staff' | 'customer' | 'system' | 'bot'
          p_external_id?: string | null
          p_ai_generated?: boolean
          p_metadata?: Json
        }
        Returns: string
      }
      ai_record_usage: {
        Args: {
          p_tenant: string
          p_agent: string | null
          p_conversation: string | null
          p_channel: AiChannel
          p_provider: string
          p_model: string | null
          p_operation: AiOperation
          p_prompt_tokens: number | null
          p_completion_tokens: number | null
          p_estimated_cost: number | null
          p_latency_ms: number | null
          p_success: boolean | null
          p_error_code: string | null
          p_request_id: string | null
        }
        Returns: string
      }
      ai_claim_follow_up_job: {
        Args: { p_job: string }
        Returns: AiFollowUpJobPayload | Record<string, never>
      }
      ai_complete_follow_up_job: {
        Args: {
          p_job: string
          p_status: 'sent' | 'skipped' | 'failed' | 'cancelled'
          p_provider_message_id?: string | null
          p_error?: string | null
        }
        Returns: undefined
      }
      ai_upsert_call_session: {
        Args: {
          p_tenant: string
          p_provider: string
          p_provider_call_id: string
          p_direction?: 'inbound' | 'outbound'
          p_from_number?: string | null
          p_to_number?: string | null
          p_status?: AiCallStatus
          p_contact_id?: string | null
          p_conversation_id?: string | null
          p_metadata?: Json
        }
        Returns: string
      }

      /* AI Sales Agent — trusted RPCs. RLS and membership remain authoritative. */
      can_manage_sales_agent: { Args: { p_tenant: string }; Returns: boolean }
      sales_is_suppressed: { Args: { p_tenant: string; p_email: string }; Returns: boolean }
      sales_normalize_website: { Args: { p_website: string }; Returns: string | null }
      sales_find_duplicate_prospect: {
        Args: {
          p_tenant: string
          p_email?: string | null
          p_website?: string | null
          p_business_name?: string | null
          p_city?: string | null
          p_country?: string | null
        }
        Returns: string | null
      }
      sales_create_prospect: {
        Args: {
          p_tenant: string
          p_business_name: string
          p_industry?: string | null
          p_city?: string | null
          p_state?: string | null
          p_country?: string | null
          p_website?: string | null
          p_business_size?: string | null
          p_contact_person?: string | null
          p_email?: string | null
          p_phone?: string | null
          p_source?: string
          p_source_reference?: string | null
          p_assigned_to?: string | null
          p_notes?: string | null
        }
        Returns: string
      }
      sales_update_prospect: {
        Args: {
          p_tenant: string
          p_prospect: string
          p_business_name: string
          p_industry?: string | null
          p_city?: string | null
          p_state?: string | null
          p_country?: string | null
          p_website?: string | null
          p_business_size?: string | null
          p_contact_person?: string | null
          p_email?: string | null
          p_phone?: string | null
          p_assigned_to?: string | null
          p_notes?: string | null
        }
        Returns: undefined
      }
      sales_set_prospect_lead_status: {
        Args: { p_tenant: string; p_prospect: string; p_status: SalesLeadStatus }
        Returns: undefined
      }
      sales_delete_prospect: {
        Args: { p_tenant: string; p_prospect: string }
        Returns: undefined
      }
      sales_convert_prospect_to_contact: {
        Args: { p_tenant: string; p_prospect: string }
        Returns: string
      }
      sales_save_search: {
        Args: {
          p_tenant: string
          p_name: string
          p_criteria: Json
          p_provider?: 'manual' | 'google_places' | 'other'
          p_search?: string | null
        }
        Returns: string
      }
      sales_import_prospects: {
        Args: {
          p_tenant: string
          p_rows: Json
          p_source?: string
        }
        Returns: SalesImportResult
      }
      sales_dashboard_metrics: { Args: { p_tenant: string }; Returns: SalesAgentMetrics }

      /* Phase 3 — drafting, campaigns, approvals and send preparation. */
      sales_create_campaign: {
        Args: {
          p_tenant: string
          p_name: string
          p_objective: string
          p_tone: string
          p_product_offered: string
          p_problem_addressed: string
          p_prospect_ids: Json
        }
        Returns: SalesCampaignCreateResult
      }
      sales_save_email_draft: {
        Args: {
          p_tenant: string
          p_message: string
          p_decision_maker: string | null
          p_subject: string
          p_body: string
          p_opening: string | null
          p_cta: string | null
          p_follow_up_subject: string | null
          p_follow_up_body: string | null
          p_generation_source?: string
        }
        Returns: undefined
      }
      sales_submit_for_approval: { Args: { p_tenant: string; p_message: string }; Returns: undefined }
      sales_review_email_draft: {
        Args: {
          p_tenant: string
          p_message: string
          p_decision: string
          p_edited_subject: string | null
          p_edited_body: string | null
          p_reason: string | null
        }
        Returns: undefined
      }
      sales_queue_approved_email: { Args: { p_tenant: string; p_message: string }; Returns: string }
      sales_add_suppression: {
        Args: { p_tenant: string; p_email: string; p_reason: string; p_source: string | null }
        Returns: undefined
      }
      sales_mark_outbox_failed: {
        Args: { p_tenant: string; p_outbox: string; p_error: string }
        Returns: undefined
      }
      sales_retry_outbox: { Args: { p_tenant: string; p_outbox: string }; Returns: undefined }
      sales_campaign_summary: { Args: { p_tenant: string; p_campaign: string }; Returns: SalesCampaignSummary }

      /* Phase 4 — decision makers, verification evidence, signals and replies. */
      sales_create_decision_maker: {
        Args: {
          p_tenant: string
          p_prospect: string
          p_full_name: string
          p_job_title: string | null
          p_email: string | null
          p_phone: string | null
          p_linkedin_url: string | null
          p_research_source: string | null
        }
        Returns: string
      }
      sales_update_decision_maker: {
        Args: {
          p_tenant: string
          p_decision_maker: string
          p_full_name: string
          p_job_title: string | null
          p_email: string | null
          p_phone: string | null
          p_linkedin_url: string | null
          p_research_source: string | null
        }
        Returns: undefined
      }
      sales_delete_decision_maker: { Args: { p_tenant: string; p_decision_maker: string }; Returns: undefined }
      sales_record_verification: {
        Args: {
          p_tenant: string
          p_entity_type: 'prospect' | 'decision_maker'
          p_entity_id: string
          p_status: SalesVerificationStatus
          p_method: 'manual'
          p_evidence?: Json
        }
        Returns: string
      }
      sales_add_signal: {
        Args: {
          p_tenant: string
          p_prospect: string
          p_signal_type: 'note' | 'website' | 'news' | 'referral' | 'other'
          p_summary: string
          p_source_url: string | null
        }
        Returns: string
      }
      sales_delete_signal: { Args: { p_tenant: string; p_signal: string }; Returns: undefined }
      sales_record_reply: {
        Args: {
          p_tenant: string
          p_prospect: string
          p_message: string | null
          p_campaign: string | null
          p_sender_email: string | null
          p_subject: string | null
          p_body: string | null
          p_classification: 'interested' | 'not_interested' | 'follow_up_required' | 'unsubscribe' | 'unknown'
          p_external_id?: string | null
          p_received_at?: string | null
        }
        Returns: string
      }
      sales_update_reply: {
        Args: {
          p_tenant: string
          p_reply: string
          p_reply_status: 'unread' | 'read' | 'archived'
          p_classification: 'interested' | 'not_interested' | 'follow_up_required' | 'unsubscribe' | 'unknown'
        }
        Returns: undefined
      }
      sales_delete_reply: { Args: { p_tenant: string; p_reply: string }; Returns: undefined }

      /* Growth — local-only 0021. Every write is tenant scoped and audited. */
      growth_create_campaign: {
        Args: {
          p_tenant: string
          p_name: string
          p_channel: GrowthChannel
          p_objective: string
          p_status: GrowthCampaignStatus
          p_starts_on: string | null
          p_ends_on: string | null
          p_notes: string | null
        }
        Returns: string
      }
      growth_update_campaign: {
        Args: {
          p_tenant: string
          p_campaign: string
          p_name: string
          p_channel: GrowthChannel
          p_objective: string
          p_status: GrowthCampaignStatus
          p_starts_on: string | null
          p_ends_on: string | null
          p_notes: string | null
        }
        Returns: undefined
      }
      growth_delete_campaign: { Args: { p_tenant: string; p_campaign: string }; Returns: undefined }
      growth_create_creative: {
        Args: {
          p_tenant: string
          p_campaign: string
          p_name: string
          p_channel: GrowthChannel
          p_headline: string | null
          p_message: string
          p_cta: string | null
          p_status: GrowthCreativeStatus
        }
        Returns: string
      }
      growth_update_creative: {
        Args: {
          p_tenant: string
          p_creative: string
          p_name: string
          p_channel: GrowthChannel
          p_headline: string | null
          p_message: string
          p_cta: string | null
          p_status: GrowthCreativeStatus
        }
        Returns: undefined
      }
      growth_delete_creative: { Args: { p_tenant: string; p_creative: string }; Returns: undefined }
      growth_create_site: {
        Args: {
          p_tenant: string
          p_name: string
          p_slug: string
          p_domain: string | null
          p_status: GrowthSiteStatus
          p_notes: string | null
        }
        Returns: string
      }
      growth_update_site: {
        Args: {
          p_tenant: string
          p_site: string
          p_name: string
          p_slug: string
          p_domain: string | null
          p_status: GrowthSiteStatus
          p_notes: string | null
        }
        Returns: undefined
      }
      growth_delete_site: { Args: { p_tenant: string; p_site: string }; Returns: undefined }
      growth_record_submission: {
        Args: {
          p_tenant: string
          p_site: string
          p_full_name: string
          p_email: string
          p_message: string | null
          p_status: GrowthSubmissionStatus
        }
        Returns: string
      }
      growth_update_submission: {
        Args: { p_tenant: string; p_submission: string; p_status: GrowthSubmissionStatus }
        Returns: undefined
      }
      growth_delete_submission: { Args: { p_tenant: string; p_submission: string }; Returns: undefined }
      growth_record_review: {
        Args: {
          p_tenant: string
          p_source: GrowthReviewSource
          p_author: string
          p_rating: number
          p_title: string | null
          p_body: string | null
          p_review_date: string | null
          p_status: GrowthReviewStatus
        }
        Returns: string
      }
      growth_update_review: {
        Args: { p_tenant: string; p_review: string; p_status: GrowthReviewStatus; p_response: string | null }
        Returns: undefined
      }
      growth_delete_review: { Args: { p_tenant: string; p_review: string }; Returns: undefined }
      growth_record_feedback: {
        Args: {
          p_tenant: string
          p_source: GrowthFeedbackSource
          p_customer: string
          p_rating: number
          p_comment: string | null
          p_status: GrowthSubmissionStatus
        }
        Returns: string
      }
      growth_update_feedback: {
        Args: { p_tenant: string; p_feedback: string; p_status: GrowthSubmissionStatus }
        Returns: undefined
      }
      growth_delete_feedback: { Args: { p_tenant: string; p_feedback: string }; Returns: undefined }

      /* Tasks — local-only 0022. No client-supplied actor or completion time. */
      tasks_create_task: {
        Args: {
          p_tenant: string
          p_title: string
          p_description: string | null
          p_assigned_to: string | null
          p_due_at: string | null
        }
        Returns: string
      }
      tasks_update_task: {
        Args: {
          p_tenant: string
          p_task: string
          p_title: string
          p_description: string | null
          p_assigned_to: string | null
          p_due_at: string | null
        }
        Returns: undefined
      }
      tasks_set_status: {
        Args: { p_tenant: string; p_task: string; p_status: TaskStatus }
        Returns: undefined
      }
      tasks_delete_task: { Args: { p_tenant: string; p_task: string }; Returns: undefined }

      /* Voice / AI Call Agent — local-only 0023. Provider-agnostic shell. */
      voice_upsert_agent: {
        Args: {
          p_tenant: string
          p_agent: string | null
          p_name: string
          p_status: VoiceAgentStatus
          p_direction: VoiceAgentDirection
          p_languages: string[]
          p_greeting: string | null
          p_faq_summary: string | null
          p_booking_mode: VoiceBookingMode
          p_handoff_phone: string | null
          p_provider: VoiceProvider
          p_provider_phone_number: string | null
        }
        Returns: string
      }
      voice_log_call_session: {
        Args: {
          p_tenant: string
          p_agent: string | null
          p_contact: string | null
          p_direction: CallSessionDirection
          p_status: CallSessionStatus
          p_provider: CallSessionProvider
          p_from_number: string | null
          p_to_number: string | null
          p_language: string | null
          p_started_at: string | null
          p_ended_at: string | null
          p_duration_seconds: number | null
          p_outcome: string | null
          p_summary: string | null
          p_consent_recording: boolean
          p_needs_handoff: boolean
        }
        Returns: string
      }
      voice_create_handoff: {
        Args: { p_tenant: string; p_call_session: string; p_reason: string; p_assigned_to: string | null; p_notes: string | null }
        Returns: string
      }
      voice_resolve_handoff: { Args: { p_tenant: string; p_handoff: string }; Returns: undefined }

      /* Payments manual invoices — local-only 0024. No provider integration. */
      payments_create_invoice: {
        Args: {
          p_tenant: string
          p_contact: string | null
          p_title: string
          p_status: 'draft' | 'sent'
          p_currency: string
          p_issue_date: string
          p_due_date: string | null
          p_line_items: Json
          p_tax_amount: number
          p_discount_amount: number
          p_notes: string | null
        }
        Returns: string
      }
      payments_update_invoice: {
        Args: {
          p_tenant: string
          p_invoice: string
          p_contact: string | null
          p_title: string
          p_status: 'draft' | 'sent' | 'void'
          p_currency: string
          p_issue_date: string
          p_due_date: string | null
          p_line_items: Json
          p_tax_amount: number
          p_discount_amount: number
          p_notes: string | null
        }
        Returns: undefined
      }
      payments_record_payment: {
        Args: {
          p_tenant: string
          p_invoice: string
          p_amount: number
          p_method: InvoicePaymentMethod
          p_reference: string | null
          p_paid_at: string | null
          p_notes: string | null
        }
        Returns: string
      }
      payments_delete_invoice: { Args: { p_tenant: string; p_invoice: string }; Returns: undefined }

      admin_list_businesses: {
        Args: Record<string, never>
        Returns: Array<{
          id: string
          name: string
          slug: string
          industry: string
          status: string
          plan_name: string | null
          subscription_status: string | null
          member_count: number
          created_at: string
        }>
      }
      admin_list_plans: { Args: Record<string, never>; Returns: PlanRow[] }
      admin_platform_stats: {
        Args: Record<string, never>
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
