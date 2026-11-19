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
  source: string | null
  status: 'lead' | 'customer' | 'inactive'
  assigned_to: string | null
  custom_data: Json
  created_at: string
  updated_at: string
}

type PipelineRow = {
  id: string
  tenant_id: string
  name: string
  is_default: boolean
  created_at: string
}

type StageRow = {
  id: string
  tenant_id: string
  pipeline_id: string
  name: string
  position: number
  probability: number
}

type DealRow = {
  id: string
  tenant_id: string
  contact_id: string
  pipeline_id: string
  stage_id: string
  title: string
  value: number
  currency: string
  assigned_to: string | null
  status: 'open' | 'won' | 'lost'
  created_at: string
  updated_at: string
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
