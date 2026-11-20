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

type AppointmentRow = {
  id: string
  tenant_id: string
  contact_id: string | null
  title: string
  start_at: string
  end_at: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  assigned_to: string | null
  created_at: string
  updated_at: string
}

type ConversationRow = {
  id: string
  tenant_id: string
  contact_id: string | null
  channel: string
  status: 'open' | 'closed' | 'pending'
  assigned_to: string | null
  created_at: string
  updated_at: string
}

type MessageRow = {
  id: string
  tenant_id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  content: string | null
  provider_message_id: string | null
  delivery_status: string
  created_at: string
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
