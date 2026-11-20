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
  received_at: string
  processed_at: string | null
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

type TaskRow = {
  id: string
  tenant_id: string
  title: string
  description: string | null
  assigned_to: string | null
  due_at: string | null
  status: 'pending' | 'in_progress' | 'completed'
  created_at: string
  updated_at: string
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
