/**
 * Generated from the hosted public schema on 2026-11-24 with:
 * supabase gen types typescript --remote=grkzontnyjnhijmphypo --schema public
 *
 * Reference snapshot only. Application code still imports the hand-written
 * aliases in src/types/database.ts; replacing that file directly breaks the
 * client because generated RPC return types are wider (Json) and columns are
 * nullable. Keep this file for schema comparison, not as a drop-in import.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_agent_knowledge: {
        Row: {
          active: boolean
          agent_id: string
          approved_at: string | null
          approved_by: string | null
          category: string
          content: string
          created_at: string
          id: string
          language: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          agent_id: string
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          content: string
          created_at?: string
          id?: string
          language?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          agent_id?: string
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          language?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_knowledge_agent_id_tenant_id_fkey"
            columns: ["agent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_agent_knowledge_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_knowledge_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_tools: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          requires_confirmation: boolean
          tenant_id: string
          tool_key: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          requires_confirmation?: boolean
          tenant_id: string
          tool_key: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          requires_confirmation?: boolean
          tenant_id?: string
          tool_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_tools_agent_id_tenant_id_fkey"
            columns: ["agent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_agent_tools_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          booking_permission: boolean
          business_info: string | null
          created_at: string
          handoff_user_id: string | null
          id: string
          language: string
          monthly_token_limit: number | null
          name: string
          permissions: Json
          public_key: string
          response_style: string
          status: string
          tenant_id: string
          tone: string
          updated_at: string
          working_hours: Json
        }
        Insert: {
          booking_permission?: boolean
          business_info?: string | null
          created_at?: string
          handoff_user_id?: string | null
          id?: string
          language?: string
          monthly_token_limit?: number | null
          name: string
          permissions?: Json
          public_key?: string
          response_style?: string
          status?: string
          tenant_id: string
          tone?: string
          updated_at?: string
          working_hours?: Json
        }
        Update: {
          booking_permission?: boolean
          business_info?: string | null
          created_at?: string
          handoff_user_id?: string | null
          id?: string
          language?: string
          monthly_token_limit?: number | null
          name?: string
          permissions?: Json
          public_key?: string
          response_style?: string
          status?: string
          tenant_id?: string
          tone?: string
          updated_at?: string
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_tenant_id_handoff_user_id_fkey"
            columns: ["tenant_id", "handoff_user_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
      ai_call_logs: {
        Row: {
          created_at: string
          duration_seconds: number | null
          error: string | null
          id: string
          outcome: string | null
          session_id: string
          summary: string | null
          tenant_id: string
          usage: Json
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          id?: string
          outcome?: string | null
          session_id: string
          summary?: string | null
          tenant_id: string
          usage?: Json
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          id?: string
          outcome?: string | null
          session_id?: string
          summary?: string | null
          tenant_id?: string
          usage?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_logs_session_id_tenant_id_fkey"
            columns: ["session_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ai_call_sessions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_call_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_sessions: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          from_number: string | null
          id: string
          metadata: Json
          provider: string
          provider_call_id: string
          started_at: string
          status: string
          tenant_id: string
          to_number: string | null
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          metadata?: Json
          provider?: string
          provider_call_id: string
          started_at?: string
          status?: string
          tenant_id: string
          to_number?: string | null
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          metadata?: Json
          provider?: string
          provider_call_id?: string
          started_at?: string
          status?: string
          tenant_id?: string
          to_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_sessions_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_call_sessions_conversation_id_tenant_id_fkey"
            columns: ["conversation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_call_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_follow_up_jobs: {
        Row: {
          attempts: number
          channel: string
          consent_status: string | null
          contact_id: string
          conversation_id: string | null
          created_at: string
          due_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          processed_at: string | null
          provider_message_id: string | null
          sequence_id: string
          status: string
          step_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: string
          consent_status?: string | null
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          due_at: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          processed_at?: string | null
          provider_message_id?: string | null
          sequence_id: string
          status?: string
          step_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: string
          consent_status?: string | null
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          processed_at?: string | null
          provider_message_id?: string | null
          sequence_id?: string
          status?: string
          step_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_follow_up_jobs_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_follow_up_jobs_conversation_id_tenant_id_fkey"
            columns: ["conversation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_follow_up_jobs_sequence_id_tenant_id_fkey"
            columns: ["sequence_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ai_follow_up_sequences"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_follow_up_jobs_step_id_tenant_id_fkey"
            columns: ["step_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ai_follow_up_steps"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_follow_up_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_follow_up_sequences: {
        Row: {
          channel: string
          created_at: string
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_follow_up_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_follow_up_steps: {
        Row: {
          active: boolean
          condition: string
          created_at: string
          delay_minutes: number
          id: string
          sequence_id: string
          step_index: number
          template_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          condition?: string
          created_at?: string
          delay_minutes?: number
          id?: string
          sequence_id: string
          step_index: number
          template_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          condition?: string
          created_at?: string
          delay_minutes?: number
          id?: string
          sequence_id?: string
          step_index?: number
          template_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_follow_up_steps_sequence_id_tenant_id_fkey"
            columns: ["sequence_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ai_follow_up_sequences"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_follow_up_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_lead_assessments: {
        Row: {
          classification: string
          contact_id: string
          conversation_id: string | null
          created_at: string
          follow_up_recommendation: string | null
          id: string
          intent: string | null
          message_id: string | null
          model: string | null
          provider: string
          service_interest: string | null
          summary: string
          tenant_id: string
        }
        Insert: {
          classification: string
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          follow_up_recommendation?: string | null
          id?: string
          intent?: string | null
          message_id?: string | null
          model?: string | null
          provider?: string
          service_interest?: string | null
          summary: string
          tenant_id: string
        }
        Update: {
          classification?: string
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          follow_up_recommendation?: string | null
          id?: string
          intent?: string | null
          message_id?: string | null
          model?: string | null
          provider?: string
          service_interest?: string | null
          summary?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_lead_assessments_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_lead_assessments_conversation_id_tenant_id_fkey"
            columns: ["conversation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_lead_assessments_message_id_tenant_id_fkey"
            columns: ["message_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_lead_assessments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          agent_id: string | null
          channel: string
          completion_tokens: number
          conversation_id: string | null
          created_at: string
          error_code: string | null
          estimated_cost: number
          id: string
          latency_ms: number | null
          model: string | null
          operation: string
          prompt_tokens: number
          provider: string
          request_id: string | null
          success: boolean
          tenant_id: string
          total_tokens: number
        }
        Insert: {
          agent_id?: string | null
          channel?: string
          completion_tokens?: number
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          estimated_cost?: number
          id?: string
          latency_ms?: number | null
          model?: string | null
          operation: string
          prompt_tokens?: number
          provider?: string
          request_id?: string | null
          success?: boolean
          tenant_id: string
          total_tokens?: number
        }
        Update: {
          agent_id?: string | null
          channel?: string
          completion_tokens?: number
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          estimated_cost?: number
          id?: string
          latency_ms?: number | null
          model?: string | null
          operation?: string
          prompt_tokens?: number
          provider?: string
          request_id?: string | null
          success?: boolean
          tenant_id?: string
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_agent_id_tenant_id_fkey"
            columns: ["agent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_usage_logs_conversation_id_tenant_id_fkey"
            columns: ["conversation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_usage_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          appointment_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          tenant_id: string
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          appointment_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          metadata?: Json
          tenant_id: string
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          appointment_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          tenant_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_events_appointment_id_tenant_id_fkey"
            columns: ["appointment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "appointment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          assigned_to: string | null
          booking_page_id: string | null
          booking_source: string
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          contact_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          end_at: string
          id: string
          idempotency_key: string | null
          manage_token: string | null
          metadata: Json
          notes: string | null
          rescheduled_from: string | null
          resource_id: string | null
          service_id: string | null
          start_at: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_page_id?: string | null
          booking_source?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          contact_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          end_at: string
          id?: string
          idempotency_key?: string | null
          manage_token?: string | null
          metadata?: Json
          notes?: string | null
          rescheduled_from?: string | null
          resource_id?: string | null
          service_id?: string | null
          start_at: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_page_id?: string | null
          booking_source?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          contact_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          end_at?: string
          id?: string
          idempotency_key?: string | null
          manage_token?: string | null
          metadata?: Json
          notes?: string | null
          rescheduled_from?: string | null
          resource_id?: string | null
          service_id?: string | null
          start_at?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_member_fkey"
            columns: ["tenant_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "appointments_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "appointments_page_fkey"
            columns: ["booking_page_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "booking_pages"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_fkey"
            columns: ["rescheduled_from", "tenant_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "appointments_resource_fkey"
            columns: ["resource_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "appointments_service_fkey"
            columns: ["service_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          metadata?: Json
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          metadata?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_exceptions: {
        Row: {
          all_day: boolean
          created_at: string
          end_at: string
          exception_type: string
          id: string
          resource_id: string | null
          start_at: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          end_at: string
          exception_type?: string
          id?: string
          resource_id?: string | null
          start_at: string
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          end_at?: string
          exception_type?: string
          id?: string
          resource_id?: string | null
          start_at?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_exceptions_resource_id_tenant_id_fkey"
            columns: ["resource_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "availability_exceptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          resource_id: string | null
          start_time: string
          tenant_id: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          resource_id?: string | null
          start_time: string
          tenant_id: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          resource_id?: string | null
          start_time?: string
          tenant_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_resource_id_tenant_id_fkey"
            columns: ["resource_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "availability_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_orders: {
        Row: {
          amount_paise: number
          billing_cycle: string
          created_at: string
          created_by: string | null
          currency: string
          failure_reason: string | null
          id: string
          paid_at: string | null
          plan_id: string
          provider: string
          provider_order_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          billing_cycle: string
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          plan_id: string
          provider?: string
          provider_order_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          billing_cycle?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          plan_id?: string
          provider?: string
          provider_order_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          enforce_limits: boolean
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enforce_limits?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enforce_limits?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id: string
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          status?: string
        }
        Relationships: []
      }
      booking_page_services: {
        Row: {
          booking_page_id: string
          created_at: string
          service_id: string
          tenant_id: string
        }
        Insert: {
          booking_page_id: string
          created_at?: string
          service_id: string
          tenant_id: string
        }
        Update: {
          booking_page_id?: string
          created_at?: string
          service_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_page_services_booking_page_id_tenant_id_fkey"
            columns: ["booking_page_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "booking_pages"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "booking_page_services_service_id_tenant_id_fkey"
            columns: ["service_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "booking_page_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_pages: {
        Row: {
          active: boolean
          allow_cancellation: boolean
          allow_rescheduling: boolean
          booking_horizon_days: number
          cancellation_hours: number
          created_at: string
          description: string | null
          id: string
          lead_time_minutes: number
          logo_url: string | null
          primary_color: string | null
          require_email: boolean
          require_phone: boolean
          slot_interval_minutes: number
          slug: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_cancellation?: boolean
          allow_rescheduling?: boolean
          booking_horizon_days?: number
          cancellation_hours?: number
          created_at?: string
          description?: string | null
          id?: string
          lead_time_minutes?: number
          logo_url?: string | null
          primary_color?: string | null
          require_email?: boolean
          require_phone?: boolean
          slot_interval_minutes?: number
          slug: string
          tenant_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_cancellation?: boolean
          allow_rescheduling?: boolean
          booking_horizon_days?: number
          cancellation_hours?: number
          created_at?: string
          description?: string | null
          id?: string
          lead_time_minutes?: number
          logo_url?: string | null
          primary_color?: string | null
          require_email?: boolean
          require_phone?: boolean
          slot_interval_minutes?: number
          slug?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_resources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          member_user_id: string | null
          name: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          member_user_id?: string | null
          name: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          member_user_id?: string | null
          name?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_resources_tenant_id_member_user_id_fkey"
            columns: ["tenant_id", "member_user_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role: string
          tenant_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          created_at: string
          id: string
          role: string
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          business_hours: Json
          currency: string
          default_locale: string
          enable_online_bookings: boolean
          enable_whatsapp: boolean
          metadata: Json
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          business_hours?: Json
          currency?: string
          default_locale?: string
          enable_online_bookings?: boolean
          enable_whatsapp?: boolean
          metadata?: Json
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_hours?: Json
          currency?: string
          default_locale?: string
          enable_online_bookings?: boolean
          enable_whatsapp?: boolean
          metadata?: Json
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_template_settings: {
        Row: {
          applied_at: string
          overrides_json: Json
          template_id: string
          tenant_id: string
        }
        Insert: {
          applied_at?: string
          overrides_json?: Json
          template_id: string
          tenant_id: string
        }
        Update: {
          applied_at?: string
          overrides_json?: Json
          template_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_template_settings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "industry_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_template_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          country_code: string
          created_at: string
          currency: string
          email: string | null
          id: string
          industry: string
          name: string
          phone: string | null
          slug: string
          status: string
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          country_code?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          industry: string
          name: string
          phone?: string | null
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          industry?: string
          name?: string
          phone?: string | null
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      calendar_connections: {
        Row: {
          access_token: string | null
          calendar_id: string
          connected_by: string | null
          created_at: string
          google_email: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          provider: string
          refresh_token: string | null
          scope: string | null
          status: string
          sync_enabled: boolean
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string
          connected_by?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider: string
          refresh_token?: string | null
          scope?: string | null
          status?: string
          sync_enabled?: boolean
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string
          connected_by?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          status?: string
          sync_enabled?: boolean
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_mappings: {
        Row: {
          appointment_id: string
          created_at: string
          google_event_id: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          payload_hash: string | null
          provider: string
          sync_status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          google_event_id?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          payload_hash?: string | null
          provider: string
          sync_status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          google_event_id?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          payload_hash?: string | null
          provider?: string
          sync_status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_mappings_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      call_events: {
        Row: {
          call_session_id: string
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          payload: Json
          tenant_id: string
        }
        Insert: {
          call_session_id: string
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          payload?: Json
          tenant_id: string
        }
        Update: {
          call_session_id?: string
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          payload?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_events_call_session_id_tenant_id_fkey"
            columns: ["call_session_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "call_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      call_handoffs: {
        Row: {
          assigned_to: string | null
          call_session_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          reason: string
          resolved_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          call_session_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reason: string
          resolved_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          call_session_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reason?: string
          resolved_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_handoffs_call_session_id_tenant_id_fkey"
            columns: ["call_session_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "call_handoffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_handoffs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sessions: {
        Row: {
          agent_id: string | null
          consent_recording: boolean
          contact_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          from_number: string | null
          id: string
          language: string | null
          needs_handoff: boolean
          outcome: string | null
          provider: string
          provider_call_id: string | null
          started_at: string | null
          status: string
          summary: string | null
          tenant_id: string
          to_number: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          consent_recording?: boolean
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          language?: string | null
          needs_handoff?: boolean
          outcome?: string | null
          provider?: string
          provider_call_id?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          tenant_id: string
          to_number?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          consent_recording?: boolean
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          language?: string | null
          needs_handoff?: boolean
          outcome?: string | null
          provider?: string
          provider_call_id?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          tenant_id?: string
          to_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_agent_id_tenant_id_fkey"
            columns: ["agent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "call_sessions_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "call_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transcripts: {
        Row: {
          call_session_id: string
          created_at: string
          id: string
          language: string | null
          message: string
          occurred_at: string
          speaker: string
          tenant_id: string
        }
        Insert: {
          call_session_id: string
          created_at?: string
          id?: string
          language?: string | null
          message: string
          occurred_at?: string
          speaker: string
          tenant_id: string
        }
        Update: {
          call_session_id?: string
          created_at?: string
          id?: string
          language?: string | null
          message?: string
          occurred_at?: string
          speaker?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_transcripts_call_session_id_tenant_id_fkey"
            columns: ["call_session_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "call_transcripts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_credentials: {
        Row: {
          channel_id: string
          created_at: string
          external_identifier: string | null
          id: string
          last_verified_at: string | null
          provider: string
          scopes: Json
          secret_ref: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          external_identifier?: string | null
          id?: string
          last_verified_at?: string | null
          provider: string
          scopes?: Json
          secret_ref: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          external_identifier?: string | null
          id?: string
          last_verified_at?: string | null
          provider?: string
          scopes?: Json
          secret_ref?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_credentials_channel_id_tenant_id_fkey"
            columns: ["channel_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "channel_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          active: boolean
          channel_type: string
          config: Json
          created_at: string
          id: string
          identifier: string | null
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel_type?: string
          config?: Json
          created_at?: string
          id?: string
          identifier?: string | null
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel_type?: string
          config?: Json
          created_at?: string
          id?: string
          identifier?: string | null
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_consents: {
        Row: {
          channel: string
          consented_at: string
          contact_id: string
          created_at: string
          id: string
          proof: Json
          revoked_at: string | null
          source: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          consented_at?: string
          contact_id: string
          created_at?: string
          id?: string
          proof?: Json
          revoked_at?: string | null
          source: string
          status: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          consented_at?: string
          contact_id?: string
          created_at?: string
          id?: string
          proof?: Json
          revoked_at?: string | null
          source?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_consents_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "communication_consents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_activities: {
        Row: {
          body: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          deal_id: string | null
          id: string
          metadata: Json
          occurred_at: string
          subject: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          body?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          subject?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          body?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          subject?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_activities_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "contact_activities_deal_id_tenant_id_fkey"
            columns: ["deal_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "contact_activities_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "contact_activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_import_batches: {
        Row: {
          batch_index: number
          created_at: string
          job_id: string
          results: Json
          row_count: number
        }
        Insert: {
          batch_index: number
          created_at?: string
          job_id: string
          results?: Json
          row_count?: number
        }
        Update: {
          batch_index?: number
          created_at?: string
          job_id?: string
          results?: Json
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "contact_import_batches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "contact_import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_import_jobs: {
        Row: {
          completed_at: string | null
          confirmed_new_duplicates: boolean
          created_at: string
          created_by: string | null
          created_count: number
          duplicate_mode: string
          error_report: Json
          failed_count: number
          file_hash: string
          file_name: string
          file_size: number
          id: string
          kind: string
          processed_rows: number
          skipped_count: number
          started_at: string | null
          status: string
          tenant_id: string
          total_rows: number
          updated_count: number
        }
        Insert: {
          completed_at?: string | null
          confirmed_new_duplicates?: boolean
          created_at?: string
          created_by?: string | null
          created_count?: number
          duplicate_mode: string
          error_report?: Json
          failed_count?: number
          file_hash: string
          file_name: string
          file_size?: number
          id?: string
          kind: string
          processed_rows?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          tenant_id: string
          total_rows?: number
          updated_count?: number
        }
        Update: {
          completed_at?: string | null
          confirmed_new_duplicates?: boolean
          created_at?: string
          created_by?: string | null
          created_count?: number
          duplicate_mode?: string
          error_report?: Json
          failed_count?: number
          file_hash?: string
          file_name?: string
          file_size?: number
          id?: string
          kind?: string
          processed_rows?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          tenant_id?: string
          total_rows?: number
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "contact_import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_import_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          tag_id: string
          tenant_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          tag_id: string
          tenant_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_tenant_id_fkey"
            columns: ["tag_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "contact_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_verifications: {
        Row: {
          checked_at: string
          checked_by: string | null
          entity_id: string
          entity_type: string
          evidence: Json
          id: string
          method: string
          provider: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          entity_id: string
          entity_type: string
          evidence?: Json
          id?: string
          method: string
          provider?: string | null
          status: string
          tenant_id: string
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          entity_id?: string
          entity_type?: string
          evidence?: Json
          id?: string
          method?: string
          provider?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_verifications_tenant_id_checked_by_fkey"
            columns: ["tenant_id", "checked_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "contact_verifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          area: string | null
          assigned_to: string | null
          clinic: string | null
          company: string | null
          converted_at: string | null
          created_at: string
          custom_data: Json
          email: string | null
          first_name: string
          follow_up_at: string | null
          google_maps_url: string | null
          id: string
          import_allow_duplicate: boolean
          last_contacted_at: string | null
          last_name: string | null
          lead_score: number
          lead_status: string
          mobile: string | null
          notes: string | null
          phone: string | null
          rating: number | null
          reply_1: string | null
          reviews: number | null
          sent: boolean
          source: string | null
          source_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          why_included: string | null
        }
        Insert: {
          area?: string | null
          assigned_to?: string | null
          clinic?: string | null
          company?: string | null
          converted_at?: string | null
          created_at?: string
          custom_data?: Json
          email?: string | null
          first_name: string
          follow_up_at?: string | null
          google_maps_url?: string | null
          id?: string
          import_allow_duplicate?: boolean
          last_contacted_at?: string | null
          last_name?: string | null
          lead_score?: number
          lead_status?: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          rating?: number | null
          reply_1?: string | null
          reviews?: number | null
          sent?: boolean
          source?: string | null
          source_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          why_included?: string | null
        }
        Update: {
          area?: string | null
          assigned_to?: string | null
          clinic?: string | null
          company?: string | null
          converted_at?: string | null
          created_at?: string
          custom_data?: Json
          email?: string | null
          first_name?: string
          follow_up_at?: string | null
          google_maps_url?: string | null
          id?: string
          import_allow_duplicate?: boolean
          last_contacted_at?: string | null
          last_name?: string | null
          lead_score?: number
          lead_status?: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          rating?: number | null
          reply_1?: string | null
          reviews?: number | null
          sent?: boolean
          source?: string | null
          source_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          why_included?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_assigned_tenant_fkey"
            columns: ["tenant_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_handoffs: {
        Row: {
          accepted_at: string | null
          completed_at: string | null
          conversation_id: string
          created_at: string
          from_user_id: string | null
          id: string
          note: string | null
          reason: string | null
          status: string
          tenant_id: string
          to_user_id: string
        }
        Insert: {
          accepted_at?: string | null
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          note?: string | null
          reason?: string | null
          status?: string
          tenant_id: string
          to_user_id: string
        }
        Update: {
          accepted_at?: string | null
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          from_user_id?: string | null
          id?: string
          note?: string | null
          reason?: string | null
          status?: string
          tenant_id?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_handoffs_conversation_id_tenant_id_fkey"
            columns: ["conversation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "conversation_handoffs_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_handoffs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_handoffs_tenant_id_to_user_id_fkey"
            columns: ["tenant_id", "to_user_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_handed_off_at: string | null
          ai_status: string
          assigned_to: string | null
          channel: string
          channel_id: string | null
          contact_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          id: string
          last_message_at: string | null
          priority: string
          status: string
          subject: string | null
          tenant_id: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          ai_handed_off_at?: string | null
          ai_status?: string
          assigned_to?: string | null
          channel: string
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          last_message_at?: string | null
          priority?: string
          status?: string
          subject?: string | null
          tenant_id: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          ai_handed_off_at?: string | null
          ai_status?: string
          assigned_to?: string | null
          channel?: string
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          last_message_at?: string | null
          priority?: string
          status?: string
          subject?: string | null
          tenant_id?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_member_fkey"
            columns: ["tenant_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "conversations_channel_fkey"
            columns: ["channel_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "conversations_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          active: boolean
          created_at: string
          entity_type: string
          id: string
          key: string
          label: string
          options: Json
          position: number
          required: boolean
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          entity_type: string
          id?: string
          key: string
          label: string
          options?: Json
          position?: number
          required?: boolean
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          entity_type?: string
          id?: string
          key?: string
          label?: string
          options?: Json
          position?: number
          required?: boolean
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          deal_id: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          deal_id: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_assignments_deal_id_tenant_id_fkey"
            columns: ["deal_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "deal_assignments_tenant_id_assigned_by_fkey"
            columns: ["tenant_id", "assigned_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "deal_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_assignments_tenant_id_user_id_fkey"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
      deals: {
        Row: {
          assigned_to: string | null
          contact_id: string
          created_at: string
          currency: string
          custom_data: Json
          description: string | null
          expected_close_date: string | null
          id: string
          lost_at: string | null
          lost_reason: string | null
          pipeline_id: string
          probability: number
          stage_id: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
          value: number
          won_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          currency?: string
          custom_data?: Json
          description?: string | null
          expected_close_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          pipeline_id: string
          probability?: number
          stage_id: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          currency?: string
          custom_data?: Json
          description?: string | null
          expected_close_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          pipeline_id?: string
          probability?: number
          stage_id?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_assigned_tenant_fkey"
            columns: ["tenant_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "deals_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "deals_pipeline_id_tenant_id_fkey"
            columns: ["pipeline_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "deals_pipeline_stage_tenant_fkey"
            columns: ["tenant_id", "pipeline_id", "stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["tenant_id", "pipeline_id", "id"]
          },
          {
            foreignKeyName: "deals_stage_id_tenant_id_fkey"
            columns: ["stage_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      decision_makers: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          job_title: string | null
          linkedin_url: string | null
          phone: string | null
          prospect_id: string
          research_source: string | null
          tenant_id: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          job_title?: string | null
          linkedin_url?: string | null
          phone?: string | null
          prospect_id: string
          research_source?: string | null
          tenant_id: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          job_title?: string | null
          linkedin_url?: string | null
          phone?: string | null
          prospect_id?: string
          research_source?: string | null
          tenant_id?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_makers_prospect_id_tenant_id_fkey"
            columns: ["prospect_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "decision_makers_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "decision_makers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_campaigns: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          name: string
          notes: string | null
          objective: string
          starts_on: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          name: string
          notes?: string | null
          objective: string
          starts_on?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          name?: string
          notes?: string | null
          objective?: string
          starts_on?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_campaigns_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "growth_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_creatives: {
        Row: {
          campaign_id: string
          channel: string
          created_at: string
          created_by: string | null
          cta: string | null
          headline: string | null
          id: string
          message: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          channel: string
          created_at?: string
          created_by?: string | null
          cta?: string | null
          headline?: string | null
          id?: string
          message: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          cta?: string | null
          headline?: string | null
          id?: string
          message?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_creatives_campaign_id_tenant_id_fkey"
            columns: ["campaign_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "growth_campaigns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "growth_creatives_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "growth_creatives_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_feedback: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          customer: string
          id: string
          rating: number
          source: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          customer: string
          id?: string
          rating: number
          source: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string
          id?: string
          rating?: number
          source?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_feedback_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "growth_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_form_submissions: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          message: string | null
          recorded_by: string | null
          status: string
          tenant_id: string
          updated_at: string
          website_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          recorded_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          website_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          recorded_by?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_form_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_form_submissions_tenant_id_recorded_by_fkey"
            columns: ["tenant_id", "recorded_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "growth_form_submissions_website_id_tenant_id_fkey"
            columns: ["website_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "growth_websites"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      growth_reviews: {
        Row: {
          author: string
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          rating: number
          responded_by: string | null
          response: string | null
          review_date: string | null
          source: string
          status: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          author: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          rating: number
          responded_by?: string | null
          response?: string | null
          review_date?: string | null
          source: string
          status?: string
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          author?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          rating?: number
          responded_by?: string | null
          response?: string | null
          review_date?: string | null
          source?: string
          status?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_reviews_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "growth_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_reviews_tenant_id_responded_by_fkey"
            columns: ["tenant_id", "responded_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
      growth_websites: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string | null
          id: string
          name: string
          notes: string | null
          slug: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain?: string | null
          id?: string
          name: string
          notes?: string | null
          slug: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string | null
          id?: string
          name?: string
          notes?: string | null
          slug?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_websites_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "growth_websites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_templates: {
        Row: {
          active: boolean
          configuration_json: Json
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          configuration_json?: Json
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          configuration_json?: Json
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      integration_secrets: {
        Row: {
          ciphertext: string
          created_at: string
          created_by: string | null
          id: string
          iv: string
          last_error: string | null
          last_verified_at: string | null
          provider: string
          secret_name: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          ciphertext: string
          created_at?: string
          created_by?: string | null
          id?: string
          iv: string
          last_error?: string | null
          last_verified_at?: string | null
          provider: string
          secret_name: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          ciphertext?: string
          created_at?: string
          created_by?: string | null
          id?: string
          iv?: string
          last_error?: string | null
          last_verified_at?: string | null
          provider?: string
          secret_name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_orders: {
        Row: {
          amount_paise: number
          created_at: string
          created_by: string | null
          currency: string
          failure_reason: string | null
          id: string
          invoice_id: string
          paid_at: string | null
          provider: string
          provider_order_id: string
          provider_payment_id: string | null
          receipt: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id: string
          paid_at?: string | null
          provider?: string
          provider_order_id: string
          provider_payment_id?: string | null
          receipt: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          paid_at?: string | null
          provider?: string
          provider_order_id?: string
          provider_payment_id?: string | null
          receipt?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_orders_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_payment_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider_event_id: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider_event_id: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider_event_id?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          method: string
          notes: string | null
          paid_at: string
          reference: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          method: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_amount: number
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          line_items: Json
          notes: string | null
          status: string
          subtotal: number
          tax_amount: number
          tenant_id: string
          title: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tenant_id: string
          title: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tenant_id?: string
          title?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contact_id_tenant_id_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          position: number
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          position?: number
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          position?: number
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category: string
          content: string
          created_at: string
          id: string
          language: string
          provider: string
          provider_template_name: string | null
          status: string
          template_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          content: string
          created_at?: string
          id?: string
          language?: string
          provider?: string
          provider_template_name?: string | null
          status?: string
          template_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          language?: string
          provider?: string
          provider_template_name?: string | null
          status?: string
          template_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_generated: boolean
          author_id: string | null
          author_type: string
          content: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          delivery_status: string
          direction: string
          id: string
          is_internal: boolean
          message_type: string
          metadata: Json
          provider_message_id: string | null
          read_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          author_id?: string | null
          author_type?: string
          content?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          direction: string
          id?: string
          is_internal?: boolean
          message_type?: string
          metadata?: Json
          provider_message_id?: string | null
          read_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          author_id?: string | null
          author_type?: string
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          direction?: string
          id?: string
          is_internal?: boolean
          message_type?: string
          metadata?: Json
          provider_message_id?: string | null
          read_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_tenant_id_fkey"
            columns: ["conversation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          delivery_channel: string
          delivery_status: string
          entity_id: string | null
          entity_type: string | null
          id: string
          notification_type: string
          read_at: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          delivery_channel?: string
          delivery_status?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          notification_type: string
          read_at?: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          delivery_channel?: string
          delivery_status?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          notification_type?: string
          read_at?: string | null
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_user_id_fkey"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_connection_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          provider: string
          redirect_path: string
          state_token: string
          tenant_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          provider: string
          redirect_path?: string
          state_token: string
          tenant_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          provider?: string
          redirect_path?: string
          state_token?: string
          tenant_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_connection_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaigns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          objective: string | null
          problem_addressed: string | null
          product_offered: string | null
          rejected_reason: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          subject: string | null
          tenant_id: string
          tone: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          objective?: string | null
          problem_addressed?: string | null
          product_offered?: string | null
          rejected_reason?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
          tone?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          objective?: string | null
          problem_addressed?: string | null
          product_offered?: string | null
          rejected_reason?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaigns_tenant_id_approved_by_fkey"
            columns: ["tenant_id", "approved_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "outreach_campaigns_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "outreach_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_messages: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          campaign_id: string
          created_at: string
          cta: string | null
          decision_maker_id: string | null
          follow_up_body: string | null
          follow_up_subject: string | null
          generation_source: string
          id: string
          opening: string | null
          prospect_id: string
          provider_message_id: string | null
          recipient_email: string | null
          rejected_reason: string | null
          status: string
          subject: string
          submitted_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          campaign_id: string
          created_at?: string
          cta?: string | null
          decision_maker_id?: string | null
          follow_up_body?: string | null
          follow_up_subject?: string | null
          generation_source?: string
          id?: string
          opening?: string | null
          prospect_id: string
          provider_message_id?: string | null
          recipient_email?: string | null
          rejected_reason?: string | null
          status?: string
          subject: string
          submitted_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          campaign_id?: string
          created_at?: string
          cta?: string | null
          decision_maker_id?: string | null
          follow_up_body?: string | null
          follow_up_subject?: string | null
          generation_source?: string
          id?: string
          opening?: string | null
          prospect_id?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          rejected_reason?: string | null
          status?: string
          subject?: string
          submitted_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_messages_campaign_id_tenant_id_fkey"
            columns: ["campaign_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "outreach_messages_decision_maker_fkey"
            columns: ["decision_maker_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "decision_makers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "outreach_messages_prospect_id_tenant_id_fkey"
            columns: ["prospect_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "outreach_messages_tenant_id_approved_by_fkey"
            columns: ["tenant_id", "approved_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "outreach_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          message_id: string
          prospect_id: string
          provider: string | null
          provider_message_id: string | null
          queued_at: string
          recipient_email: string
          sent_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          message_id: string
          prospect_id: string
          provider?: string | null
          provider_message_id?: string | null
          queued_at?: string
          recipient_email: string
          sent_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          message_id?: string
          prospect_id?: string
          provider?: string | null
          provider_message_id?: string | null
          queued_at?: string
          recipient_email?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_outbox_message_id_tenant_id_fkey"
            columns: ["message_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "outreach_messages"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "outreach_outbox_prospect_id_tenant_id_fkey"
            columns: ["prospect_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "outreach_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_replies: {
        Row: {
          body: string | null
          campaign_id: string | null
          classification: string
          created_at: string
          external_id: string | null
          id: string
          message_id: string | null
          prospect_id: string
          provider: string
          received_at: string
          reply_status: string
          sender_email: string | null
          subject: string | null
          tenant_id: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          classification?: string
          created_at?: string
          external_id?: string | null
          id?: string
          message_id?: string | null
          prospect_id: string
          provider?: string
          received_at?: string
          reply_status?: string
          sender_email?: string | null
          subject?: string | null
          tenant_id: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          classification?: string
          created_at?: string
          external_id?: string | null
          id?: string
          message_id?: string | null
          prospect_id?: string
          provider?: string
          received_at?: string
          reply_status?: string
          sender_email?: string | null
          subject?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_replies_campaign_id_tenant_id_fkey"
            columns: ["campaign_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "outreach_replies_message_id_tenant_id_fkey"
            columns: ["message_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "outreach_messages"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "outreach_replies_prospect_id_tenant_id_fkey"
            columns: ["prospect_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "outreach_replies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_email_outbox: {
        Row: {
          appointment_id: string | null
          appointment_start_at: string | null
          attempts: number
          claimed_at: string | null
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          last_error: string | null
          provider: string | null
          provider_message_id: string | null
          review_request_id: string | null
          send_after: string
          sent_at: string | null
          status: string
          tenant_id: string
          to_email: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          appointment_start_at?: string | null
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          last_error?: string | null
          provider?: string | null
          provider_message_id?: string | null
          review_request_id?: string | null
          send_after?: string
          sent_at?: string | null
          status?: string
          tenant_id: string
          to_email: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          appointment_start_at?: string | null
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          last_error?: string | null
          provider?: string | null
          provider_message_id?: string | null
          review_request_id?: string | null
          send_after?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
          to_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_email_outbox_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_email_outbox_review_request_id_fkey"
            columns: ["review_request_id"]
            isOneToOne: false
            referencedRelation: "review_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_email_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_email_settings: {
        Row: {
          confirmations_enabled: boolean
          created_at: string
          reminder_hours_before: number
          reminders_enabled: boolean
          reply_to_email: string | null
          review_emails_auto_approve: boolean
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          confirmations_enabled?: boolean
          created_at?: string
          reminder_hours_before?: number
          reminders_enabled?: boolean
          reply_to_email?: string | null
          review_emails_auto_approve?: boolean
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          confirmations_enabled?: boolean
          created_at?: string
          reminder_hours_before?: number
          reminders_enabled?: boolean
          reply_to_email?: string | null
          review_emails_auto_approve?: boolean
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_email_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_email_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medical_history_entries: {
        Row: {
          allergies: string | null
          conditions: string | null
          consent_given: boolean
          consent_given_at: string
          consent_version: string
          contact_id: string
          created_at: string
          family_history: string | null
          id: string
          medications: string | null
          notes: string | null
          past_treatments: string | null
          recorded_at: string
          recorded_by: string | null
          tenant_id: string
        }
        Insert: {
          allergies?: string | null
          conditions?: string | null
          consent_given?: boolean
          consent_given_at?: string
          consent_version?: string
          contact_id: string
          created_at?: string
          family_history?: string | null
          id?: string
          medications?: string | null
          notes?: string | null
          past_treatments?: string | null
          recorded_at?: string
          recorded_by?: string | null
          tenant_id: string
        }
        Update: {
          allergies?: string | null
          conditions?: string | null
          consent_given?: boolean
          consent_given_at?: string
          consent_version?: string
          contact_id?: string
          created_at?: string
          family_history?: string | null
          id?: string
          medications?: string | null
          notes?: string | null
          past_treatments?: string | null
          recorded_at?: string
          recorded_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medical_history_entries_contact_fk"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "patient_medical_history_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_medical_history_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          id: string
          is_closed: boolean
          is_won: boolean
          name: string
          pipeline_id: string
          position: number
          probability: number
          slug: string | null
          tenant_id: string
        }
        Insert: {
          color?: string | null
          id?: string
          is_closed?: boolean
          is_won?: boolean
          name: string
          pipeline_id: string
          position?: number
          probability?: number
          slug?: string | null
          tenant_id: string
        }
        Update: {
          color?: string | null
          id?: string
          is_closed?: boolean
          is_won?: boolean
          name?: string
          pipeline_id?: string
          position?: number
          probability?: number
          slug?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_tenant_id_fkey"
            columns: ["pipeline_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      pipelines: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          position: number
          tenant_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          position?: number
          tenant_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          position?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          features: Json
          id: string
          limits: Json
          name: string
          price_monthly: number
          price_yearly: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          limits?: Json
          name: string
          price_monthly?: number
          price_yearly?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          limits?: Json
          name?: string
          price_monthly?: number
          price_yearly?: number
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prospect_searches: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: Json
          id: string
          last_run_at: string | null
          name: string
          provider: string
          result_count: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          id?: string
          last_run_at?: string | null
          name: string
          provider?: string
          result_count?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          id?: string
          last_run_at?: string | null
          name?: string
          provider?: string
          result_count?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_searches_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "prospect_searches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_signals: {
        Row: {
          created_at: string
          id: string
          prospect_id: string
          recorded_by: string | null
          signal_type: string
          source_url: string | null
          summary: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          prospect_id: string
          recorded_by?: string | null
          signal_type?: string
          source_url?: string | null
          summary: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          prospect_id?: string
          recorded_by?: string | null
          signal_type?: string
          source_url?: string | null
          summary?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_signals_prospect_id_tenant_id_fkey"
            columns: ["prospect_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "prospect_signals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_signals_tenant_id_recorded_by_fkey"
            columns: ["tenant_id", "recorded_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
      prospects: {
        Row: {
          assigned_to: string | null
          attribution: Json
          business_name: string
          business_size: string | null
          city: string | null
          contact_person: string | null
          converted_at: string | null
          converted_contact_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          custom_data: Json
          email: string | null
          id: string
          industry: string | null
          lead_status: string
          notes: string | null
          phone: string | null
          source: string
          source_reference: string | null
          state: string | null
          tenant_id: string
          updated_at: string
          verification_status: string
          website: string | null
        }
        Insert: {
          assigned_to?: string | null
          attribution?: Json
          business_name: string
          business_size?: string | null
          city?: string | null
          contact_person?: string | null
          converted_at?: string | null
          converted_contact_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          email?: string | null
          id?: string
          industry?: string | null
          lead_status?: string
          notes?: string | null
          phone?: string | null
          source?: string
          source_reference?: string | null
          state?: string | null
          tenant_id: string
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Update: {
          assigned_to?: string | null
          attribution?: Json
          business_name?: string
          business_size?: string | null
          city?: string | null
          contact_person?: string | null
          converted_at?: string | null
          converted_contact_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          email?: string | null
          id?: string
          industry?: string | null
          lead_status?: string
          notes?: string | null
          phone?: string | null
          source?: string
          source_reference?: string | null
          state?: string | null
          tenant_id?: string
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_tenant_id_assigned_to_fkey"
            columns: ["tenant_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "prospects_tenant_id_converted_contact_id_fkey"
            columns: ["tenant_id", "converted_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "prospects_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "prospects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_tenant_id_source_reference_fkey"
            columns: ["tenant_id", "source_reference"]
            isOneToOne: false
            referencedRelation: "prospect_searches"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      review_requests: {
        Row: {
          ai_suggestion: string | null
          ai_suggestion_status: string
          appointment_id: string | null
          approved_at: string | null
          approved_by: string | null
          channel: string
          contact_id: string | null
          created_at: string
          customer_email: string | null
          customer_feedback: string | null
          customer_name: string | null
          customer_phone: string | null
          feedback_submitted_at: string | null
          id: string
          last_error: string | null
          message_template: string | null
          public_token: string | null
          rating: number | null
          review_link_clicked_at: string | null
          review_link_type: string
          review_url: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          ai_suggestion?: string | null
          ai_suggestion_status?: string
          appointment_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          channel: string
          contact_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_feedback?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          feedback_submitted_at?: string | null
          id?: string
          last_error?: string | null
          message_template?: string | null
          public_token?: string | null
          rating?: number | null
          review_link_clicked_at?: string | null
          review_link_type?: string
          review_url?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          ai_suggestion?: string | null
          ai_suggestion_status?: string
          appointment_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_feedback?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          feedback_submitted_at?: string | null
          id?: string
          last_error?: string | null
          message_template?: string | null
          public_token?: string | null
          rating?: number | null
          review_link_clicked_at?: string | null
          review_link_type?: string
          review_url?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_email_approvals: {
        Row: {
          actor_id: string | null
          campaign_id: string
          created_at: string
          decision: string
          edited_body: string | null
          edited_subject: string | null
          id: string
          message_id: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          campaign_id: string
          created_at?: string
          decision: string
          edited_body?: string | null
          edited_subject?: string | null
          id?: string
          message_id: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          campaign_id?: string
          created_at?: string
          decision?: string
          edited_body?: string | null
          edited_subject?: string | null
          id?: string
          message_id?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_email_approvals_campaign_id_tenant_id_fkey"
            columns: ["campaign_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "sales_email_approvals_message_id_tenant_id_fkey"
            columns: ["message_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "outreach_messages"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "sales_email_approvals_tenant_id_actor_id_fkey"
            columns: ["tenant_id", "actor_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "sales_email_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resources: {
        Row: {
          created_at: string
          resource_id: string
          service_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          resource_id: string
          service_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          resource_id?: string
          service_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_resources_resource_id_tenant_id_fkey"
            columns: ["resource_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "service_resources_service_id_tenant_id_fkey"
            columns: ["service_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "service_resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          buffer_after_minutes: number
          buffer_before_minutes: number
          created_at: string
          currency: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          price?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          price?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          provider: string
          provider_subscription_id: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          provider?: string
          provider_subscription_id?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          provider?: string
          provider_subscription_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_list: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          reason: string
          source: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          reason: string
          source?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          reason?: string
          source?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppression_list_tenant_id_created_by_fkey"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "suppression_list_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      template_modules: {
        Row: {
          configuration_json: Json
          enabled: boolean
          id: string
          module_key: string
          template_id: string
        }
        Insert: {
          configuration_json?: Json
          enabled?: boolean
          id?: string
          module_key: string
          template_id: string
        }
        Update: {
          configuration_json?: Json
          enabled?: boolean
          id?: string
          module_key?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_modules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "industry_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agents: {
        Row: {
          booking_mode: string
          created_at: string
          created_by: string | null
          direction: string
          faq_summary: string | null
          greeting: string | null
          handoff_phone: string | null
          id: string
          languages: string[]
          name: string
          provider: string
          provider_phone_number: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          booking_mode?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          faq_summary?: string | null
          greeting?: string | null
          handoff_phone?: string | null
          id?: string
          languages?: string[]
          name: string
          provider?: string
          provider_phone_number?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          booking_mode?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          faq_summary?: string | null
          greeting?: string | null
          handoff_phone?: string | null
          id?: string
          languages?: string[]
          name?: string
          provider?: string
          provider_phone_number?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          error: string | null
          event_type: string
          external_id: string
          id: string
          last_attempt_at: string | null
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          signature_verified: boolean
          status: string
          tenant_id: string | null
        }
        Insert: {
          attempts?: number
          error?: string | null
          event_type: string
          external_id: string
          id?: string
          last_attempt_at?: string | null
          payload?: Json
          processed_at?: string | null
          provider: string
          received_at?: string
          signature_verified?: boolean
          status?: string
          tenant_id?: string | null
        }
        Update: {
          attempts?: number
          error?: string | null
          event_type?: string
          external_id?: string
          id?: string
          last_attempt_at?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          signature_verified?: boolean
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_run_steps: {
        Row: {
          action_label: string | null
          action_type: string
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          output: Json
          run_id: string
          started_at: string | null
          status: string
          step_index: number
          tenant_id: string
        }
        Insert: {
          action_label?: string | null
          action_type: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json
          run_id: string
          started_at?: string | null
          status?: string
          step_index: number
          tenant_id: string
        }
        Update: {
          action_label?: string | null
          action_type?: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json
          run_id?: string
          started_at?: string | null
          status?: string
          step_index?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_run_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          source_id: string | null
          source_table: string | null
          started_at: string | null
          status: string
          tenant_id: string
          trigger_payload: Json
          trigger_type: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          source_id?: string | null
          source_table?: string | null
          started_at?: string | null
          status?: string
          tenant_id: string
          trigger_payload?: Json
          trigger_type: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          source_id?: string | null
          source_table?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string
          trigger_payload?: Json
          trigger_type?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          actions: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_run_at: string | null
          name: string
          run_count: number
          status: string
          tenant_id: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          name: string
          run_count?: number
          status?: string
          tenant_id: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          name?: string
          run_count?: number
          status?: string
          tenant_id?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_business_invitation: { Args: { p_token: string }; Returns: string }
      add_contact_activity: {
        Args: {
          p_body?: string
          p_contact: string
          p_deal_id?: string
          p_occurred_at?: string
          p_subject?: string
          p_tenant: string
          p_type: string
        }
        Returns: string
      }
      admin_list_businesses: {
        Args: never
        Returns: {
          created_at: string
          id: string
          industry: string
          member_count: number
          name: string
          plan_name: string
          slug: string
          status: string
          subscription_status: string
        }[]
      }
      admin_list_plans: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          description: string | null
          features: Json
          id: string
          limits: Json
          name: string
          price_monthly: number
          price_yearly: number
        }[]
        SetofOptions: {
          from: "*"
          to: "plans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_platform_stats: { Args: never; Returns: Json }
      admin_set_billing_enforcement: {
        Args: { p_enabled: boolean }
        Returns: Json
      }
      admin_set_tenant_plan: {
        Args: { p_plan: string; p_reason?: string; p_tenant: string }
        Returns: undefined
      }
      ai_append_message: {
        Args: {
          p_ai_generated?: boolean
          p_author_type: string
          p_content: string
          p_conversation: string
          p_direction: string
          p_external_id?: string
          p_metadata?: Json
          p_tenant: string
        }
        Returns: string
      }
      ai_check_usage_limit: {
        Args: { p_agent: string; p_tenant: string }
        Returns: boolean
      }
      ai_claim_follow_up_job: { Args: { p_job: string }; Returns: Json }
      ai_complete_follow_up_job: {
        Args: {
          p_error?: string
          p_job: string
          p_provider_message_id?: string
          p_status: string
        }
        Returns: undefined
      }
      ai_enqueue_follow_up: {
        Args: {
          p_channel: string
          p_contact: string
          p_conversation?: string
          p_sequence: string
          p_tenant: string
        }
        Returns: string
      }
      ai_find_or_create_conversation: {
        Args: { p_channel: string; p_contact: string; p_tenant: string }
        Returns: string
      }
      ai_get_public_agent: { Args: { p_public_key: string }; Returns: Json }
      ai_handoff_conversation: {
        Args: {
          p_conversation: string
          p_note?: string
          p_reason?: string
          p_tenant: string
          p_to_user: string
        }
        Returns: string
      }
      ai_latest_assessment: {
        Args: { p_contact: string; p_tenant: string }
        Returns: Json
      }
      ai_record_assessment: {
        Args: {
          p_classification: string
          p_contact: string
          p_conversation?: string
          p_follow_up_recommendation?: string
          p_intent?: string
          p_message?: string
          p_model?: string
          p_provider?: string
          p_service_interest?: string
          p_summary: string
          p_tenant: string
        }
        Returns: string
      }
      ai_record_usage: {
        Args: {
          p_agent: string
          p_channel: string
          p_completion_tokens: number
          p_conversation: string
          p_error_code: string
          p_estimated_cost: number
          p_latency_ms: number
          p_model: string
          p_operation: string
          p_prompt_tokens: number
          p_provider: string
          p_request_id: string
          p_success: boolean
          p_tenant: string
        }
        Returns: string
      }
      ai_record_webhook_event: {
        Args: {
          p_event_type: string
          p_external_id: string
          p_payload: Json
          p_provider: string
          p_signature_verified?: boolean
          p_tenant: string
        }
        Returns: Json
      }
      ai_service_check_usage_limit: {
        Args: { p_agent: string; p_tenant: string }
        Returns: boolean
      }
      ai_service_enqueue_follow_up: {
        Args: {
          p_channel: string
          p_contact: string
          p_conversation?: string
          p_sequence: string
          p_tenant: string
        }
        Returns: string
      }
      ai_service_get_active_agent: { Args: { p_tenant: string }; Returns: Json }
      ai_service_get_agent: { Args: { p_public_key: string }; Returns: Json }
      ai_service_handoff_conversation: {
        Args: {
          p_conversation: string
          p_note?: string
          p_reason?: string
          p_tenant: string
          p_to_user: string
        }
        Returns: string
      }
      ai_service_mark_message_delivered: {
        Args: {
          p_message: string
          p_provider_message_id: string
          p_tenant: string
        }
        Returns: boolean
      }
      ai_service_mark_message_send_failed: {
        Args: {
          p_error_code: string
          p_message: string
          p_provider_code?: string
          p_provider_message?: string
          p_provider_trace_id?: string
          p_provider_type?: string
          p_tenant: string
        }
        Returns: boolean
      }
      ai_service_record_assessment: {
        Args: {
          p_classification: string
          p_contact: string
          p_conversation?: string
          p_follow_up_recommendation?: string
          p_intent?: string
          p_message?: string
          p_model?: string
          p_provider?: string
          p_service_interest?: string
          p_summary: string
          p_tenant: string
        }
        Returns: string
      }
      ai_service_set_consent: {
        Args: {
          p_channel: string
          p_contact: string
          p_proof?: Json
          p_source: string
          p_status: string
          p_tenant: string
        }
        Returns: string
      }
      ai_set_agent_status: {
        Args: { p_agent: string; p_status: string; p_tenant: string }
        Returns: undefined
      }
      ai_set_consent: {
        Args: {
          p_channel: string
          p_contact: string
          p_proof?: Json
          p_source: string
          p_status: string
          p_tenant: string
        }
        Returns: string
      }
      ai_set_conversation_ai_status: {
        Args: { p_conversation: string; p_status: string; p_tenant: string }
        Returns: undefined
      }
      ai_set_tool: {
        Args: {
          p_agent: string
          p_config?: Json
          p_enabled: boolean
          p_requires_confirmation?: boolean
          p_tenant: string
          p_tool_key: string
        }
        Returns: undefined
      }
      ai_upsert_agent: {
        Args: {
          p_agent_id?: string
          p_booking_permission?: boolean
          p_business_info?: string
          p_handoff_user_id?: string
          p_language?: string
          p_monthly_token_limit?: number
          p_name: string
          p_permissions?: Json
          p_response_style?: string
          p_status?: string
          p_tenant: string
          p_tone?: string
          p_working_hours?: Json
        }
        Returns: string
      }
      ai_upsert_call_session: {
        Args: {
          p_contact_id?: string
          p_conversation_id?: string
          p_direction?: string
          p_from_number?: string
          p_metadata?: Json
          p_provider: string
          p_provider_call_id: string
          p_status?: string
          p_tenant: string
          p_to_number?: string
        }
        Returns: string
      }
      ai_upsert_contact_from_channel: {
        Args: {
          p_channel: string
          p_email?: string
          p_full_name?: string
          p_phone?: string
          p_tenant: string
        }
        Returns: string
      }
      ai_upsert_credential: {
        Args: {
          p_channel: string
          p_external_identifier?: string
          p_provider: string
          p_scopes?: Json
          p_secret_ref: string
          p_tenant: string
        }
        Returns: string
      }
      ai_upsert_knowledge: {
        Args: {
          p_active?: boolean
          p_agent: string
          p_category: string
          p_content: string
          p_knowledge_id?: string
          p_language?: string
          p_tenant: string
          p_title: string
        }
        Returns: string
      }
      ai_upsert_template: {
        Args: {
          p_category?: string
          p_content: string
          p_language?: string
          p_provider?: string
          p_provider_template_name?: string
          p_status?: string
          p_template_key: string
          p_tenant: string
        }
        Returns: string
      }
      apply_industry_template: {
        Args: { p_template_slug: string; p_tenant_id: string }
        Returns: undefined
      }
      archive_contact: {
        Args: { p_contact: string; p_tenant: string }
        Returns: undefined
      }
      assign_contact: {
        Args: { p_contact: string; p_tenant: string; p_user_id: string }
        Returns: undefined
      }
      assign_deal: {
        Args: { p_deal: string; p_tenant: string; p_user_id: string }
        Returns: undefined
      }
      billing_check_entitlement: {
        Args: { p_feature: string; p_tenant: string }
        Returns: boolean
      }
      billing_check_limit: {
        Args: { p_key: string; p_tenant: string; p_used: number }
        Returns: boolean
      }
      billing_enforce_feature: {
        Args: { p_feature: string; p_tenant: string }
        Returns: boolean
      }
      billing_get_overview: { Args: { p_tenant: string }; Returns: Json }
      billing_get_settings: { Args: never; Returns: Json }
      billing_get_usage: { Args: { p_tenant: string }; Returns: Json }
      billing_service_activate_subscription: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_plan_id: string
          p_provider_order_id: string
          p_provider_payment_id: string
          p_tenant: string
        }
        Returns: string
      }
      billing_service_finish_webhook_event: {
        Args: {
          p_error?: string
          p_provider_event_id: string
          p_status: string
        }
        Returns: undefined
      }
      billing_service_mark_order_failed: {
        Args: { p_error: string; p_provider_order_id: string }
        Returns: undefined
      }
      billing_service_record_order: {
        Args: {
          p_amount_paise: number
          p_billing_cycle: string
          p_created_by: string
          p_currency: string
          p_plan_id: string
          p_provider_order_id: string
          p_tenant: string
        }
        Returns: undefined
      }
      billing_service_record_webhook_event: {
        Args: {
          p_event_type: string
          p_payload: Json
          p_provider_event_id: string
        }
        Returns: boolean
      }
      booking_assign: {
        Args: {
          p_appointment: string
          p_resource_id: string
          p_tenant: string
          p_user_id?: string
        }
        Returns: undefined
      }
      booking_compute_slots: {
        Args: {
          p_date: string
          p_exclude_appointment?: string
          p_interval_minutes: number
          p_lead_time_minutes: number
          p_resource_id: string
          p_service_id: string
          p_tenant: string
        }
        Returns: Json
      }
      booking_create_exception: {
        Args: {
          p_all_day?: boolean
          p_end_at?: string
          p_exception_type?: string
          p_resource_id?: string
          p_start_at?: string
          p_tenant: string
          p_title?: string
        }
        Returns: string
      }
      booking_create_resource: {
        Args: {
          p_active?: boolean
          p_kind?: string
          p_member_user_id?: string
          p_name: string
          p_notes?: string
          p_tenant: string
        }
        Returns: string
      }
      booking_create_service: {
        Args: {
          p_active?: boolean
          p_buffer_after_minutes?: number
          p_buffer_before_minutes?: number
          p_currency?: string
          p_description?: string
          p_duration_minutes?: number
          p_name: string
          p_price?: number
          p_tenant: string
        }
        Returns: string
      }
      booking_create_staff: {
        Args: {
          p_contact_id?: string
          p_customer_email?: string
          p_customer_name: string
          p_customer_phone?: string
          p_idempotency_key?: string
          p_notes?: string
          p_resource_id?: string
          p_service_id: string
          p_start_at: string
          p_tenant: string
        }
        Returns: string
      }
      booking_dashboard_metrics: { Args: { p_tenant: string }; Returns: Json }
      booking_delete_availability_rule: {
        Args: { p_rule: string; p_tenant: string }
        Returns: undefined
      }
      booking_delete_exception: {
        Args: { p_exception: string; p_tenant: string }
        Returns: undefined
      }
      booking_reschedule: {
        Args: {
          p_appointment: string
          p_reason?: string
          p_resource_id?: string
          p_start_at: string
          p_tenant: string
        }
        Returns: undefined
      }
      booking_set_service_active: {
        Args: { p_active: boolean; p_service: string; p_tenant: string }
        Returns: undefined
      }
      booking_set_service_resources: {
        Args: { p_resource_ids: string[]; p_service: string; p_tenant: string }
        Returns: undefined
      }
      booking_set_status: {
        Args: {
          p_appointment: string
          p_reason?: string
          p_status: string
          p_tenant: string
        }
        Returns: undefined
      }
      booking_update_page_settings: {
        Args: {
          p_active?: boolean
          p_allow_cancellation?: boolean
          p_allow_rescheduling?: boolean
          p_booking_horizon_days?: number
          p_booking_page: string
          p_cancellation_hours?: number
          p_description?: string
          p_lead_time_minutes?: number
          p_logo_url?: string
          p_primary_color?: string
          p_require_email?: boolean
          p_require_phone?: boolean
          p_service_ids?: string[]
          p_slot_interval_minutes?: number
          p_tenant: string
          p_title: string
        }
        Returns: undefined
      }
      booking_update_resource: {
        Args: {
          p_active?: boolean
          p_kind?: string
          p_member_user_id?: string
          p_name: string
          p_notes?: string
          p_resource: string
          p_tenant: string
        }
        Returns: undefined
      }
      booking_update_service: {
        Args: {
          p_active?: boolean
          p_buffer_after_minutes?: number
          p_buffer_before_minutes?: number
          p_currency?: string
          p_description?: string
          p_duration_minutes?: number
          p_name: string
          p_price?: number
          p_service: string
          p_tenant: string
        }
        Returns: undefined
      }
      booking_upsert_availability_rule: {
        Args: {
          p_day_of_week?: number
          p_end_time?: string
          p_is_active?: boolean
          p_resource_id?: string
          p_rule?: string
          p_start_time?: string
          p_tenant: string
          p_valid_from?: string
          p_valid_until?: string
        }
        Returns: string
      }
      calendar_connection_disconnect: {
        Args: { p_provider?: string; p_tenant: string }
        Returns: undefined
      }
      calendar_connection_status: {
        Args: { p_provider?: string; p_tenant: string }
        Returns: {
          calendar_id: string
          connected: boolean
          google_email: string
          last_error: string
          last_synced_at: string
          provider: string
          status: string
          sync_enabled: boolean
          updated_at: string
        }[]
      }
      can_edit_contact: {
        Args: { p_contact: string; p_tenant: string }
        Returns: boolean
      }
      can_edit_deal: {
        Args: { p_deal: string; p_tenant: string }
        Returns: boolean
      }
      can_manage_ai: { Args: { p_tenant: string }; Returns: boolean }
      can_manage_bookings: { Args: { p_tenant: string }; Returns: boolean }
      can_manage_crm: { Args: { p_tenant: string }; Returns: boolean }
      can_manage_medical_history: {
        Args: { p_tenant: string }
        Returns: boolean
      }
      can_manage_patient_document_for_user: {
        Args: { p_contact: string; p_tenant: string; p_user: string }
        Returns: boolean
      }
      can_manage_sales_agent: { Args: { p_tenant: string }; Returns: boolean }
      can_view_activity: {
        Args: { p_activity: string; p_tenant: string }
        Returns: boolean
      }
      can_view_contact: {
        Args: { p_contact: string; p_tenant: string }
        Returns: boolean
      }
      can_view_deal: {
        Args: { p_deal: string; p_tenant: string }
        Returns: boolean
      }
      claim_lead: {
        Args: { p_contact: string; p_tenant: string }
        Returns: undefined
      }
      convert_lead_to_deal: {
        Args: {
          p_assigned_to?: string
          p_contact: string
          p_currency?: string
          p_expected_close_date?: string
          p_pipeline_id: string
          p_stage_id: string
          p_tenant: string
          p_title: string
          p_value?: number
        }
        Returns: string
      }
      create_business: {
        Args: {
          p_currency?: string
          p_email?: string
          p_industry: string
          p_name: string
          p_phone?: string
          p_slug: string
          p_timezone?: string
        }
        Returns: string
      }
      create_business_invitation: {
        Args: { p_email: string; p_role: string; p_tenant_id: string }
        Returns: string
      }
      create_contact: {
        Args: {
          p_area?: string
          p_assigned_to?: string
          p_clinic?: string
          p_company?: string
          p_email?: string
          p_first_name: string
          p_google_maps_url?: string
          p_last_name?: string
          p_lead_status?: string
          p_mobile?: string
          p_notes?: string
          p_phone?: string
          p_rating?: number
          p_reply_1?: string
          p_reviews?: number
          p_sent?: boolean
          p_source?: string
          p_source_id?: string
          p_tenant: string
          p_why_included?: string
        }
        Returns: string
      }
      create_deal: {
        Args: {
          p_assigned_to?: string
          p_contact: string
          p_currency?: string
          p_description?: string
          p_expected_close_date?: string
          p_pipeline_id: string
          p_stage_id: string
          p_tenant: string
          p_title: string
          p_value?: number
        }
        Returns: string
      }
      create_pipeline: {
        Args: {
          p_color?: string
          p_description?: string
          p_name: string
          p_tenant: string
        }
        Returns: string
      }
      create_pipeline_stage: {
        Args: {
          p_color?: string
          p_is_closed?: boolean
          p_is_won?: boolean
          p_name: string
          p_pipeline_id: string
          p_probability?: number
          p_tenant: string
        }
        Returns: string
      }
      crm_check_import_duplicates: {
        Args: { p_rows: Json; p_tenant: string }
        Returns: Json
      }
      crm_complete_import: {
        Args: { p_failed?: boolean; p_job_id: string }
        Returns: Json
      }
      crm_confirm_import_duplicates: {
        Args: { p_job_id: string }
        Returns: undefined
      }
      crm_dashboard_metrics: { Args: { p_tenant: string }; Returns: Json }
      crm_delete_deal: {
        Args: { p_deal: string; p_tenant: string }
        Returns: undefined
      }
      crm_export_rows: {
        Args: {
          p_assigned_to?: string
          p_kind: string
          p_lead_status?: string
          p_limit?: number
          p_query?: string
          p_source_id?: string
          p_status?: string
          p_tag_id?: string
          p_tenant: string
        }
        Returns: {
          area: string
          clinic: string
          company: string
          created_at: string
          custom_data: Json
          email: string
          first_name: string
          google_maps_url: string
          id: string
          last_name: string
          lead_status: string
          mobile: string
          notes: string
          owner_name: string
          phone: string
          rating: number
          reply_1: string
          reviews: number
          sent: boolean
          source_name: string
          status: string
          tags: string
          why_included: string
        }[]
      }
      crm_process_import_batch: {
        Args: { p_batch_index: number; p_job_id: string; p_rows: Json }
        Returns: Json
      }
      crm_search_contacts: {
        Args: {
          p_assigned_to?: string
          p_lead_status?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_source_id?: string
          p_status?: string
          p_tag_id?: string
          p_tenant: string
        }
        Returns: {
          area: string
          assigned_to: string
          clinic: string
          company: string
          created_at: string
          email: string
          first_name: string
          google_maps_url: string
          id: string
          last_name: string
          lead_status: string
          mobile: string
          phone: string
          rating: number
          reply_1: string
          reviews: number
          sent: boolean
          source_id: string
          status: string
          total_count: number
          why_included: string
        }[]
      }
      crm_start_import: {
        Args: {
          p_duplicate_mode: string
          p_file_hash: string
          p_file_name: string
          p_file_size: number
          p_kind: string
          p_tenant: string
          p_total_rows: number
        }
        Returns: string
      }
      growth_create_campaign: {
        Args: {
          p_channel: string
          p_ends_on: string
          p_name: string
          p_notes: string
          p_objective: string
          p_starts_on: string
          p_status: string
          p_tenant: string
        }
        Returns: string
      }
      growth_create_creative: {
        Args: {
          p_campaign: string
          p_channel: string
          p_cta: string
          p_headline: string
          p_message: string
          p_name: string
          p_status: string
          p_tenant: string
        }
        Returns: string
      }
      growth_create_site: {
        Args: {
          p_domain: string
          p_name: string
          p_notes: string
          p_slug: string
          p_status: string
          p_tenant: string
        }
        Returns: string
      }
      growth_delete_campaign: {
        Args: { p_campaign: string; p_tenant: string }
        Returns: undefined
      }
      growth_delete_creative: {
        Args: { p_creative: string; p_tenant: string }
        Returns: undefined
      }
      growth_delete_feedback: {
        Args: { p_feedback: string; p_tenant: string }
        Returns: undefined
      }
      growth_delete_review: {
        Args: { p_review: string; p_tenant: string }
        Returns: undefined
      }
      growth_delete_site: {
        Args: { p_site: string; p_tenant: string }
        Returns: undefined
      }
      growth_delete_submission: {
        Args: { p_submission: string; p_tenant: string }
        Returns: undefined
      }
      growth_record_feedback: {
        Args: {
          p_comment: string
          p_customer: string
          p_rating: number
          p_source: string
          p_status: string
          p_tenant: string
        }
        Returns: string
      }
      growth_record_review: {
        Args: {
          p_author: string
          p_body: string
          p_rating: number
          p_review_date: string
          p_source: string
          p_status: string
          p_tenant: string
          p_title: string
        }
        Returns: string
      }
      growth_record_submission: {
        Args: {
          p_email: string
          p_full_name: string
          p_message: string
          p_site: string
          p_status: string
          p_tenant: string
        }
        Returns: string
      }
      growth_update_campaign: {
        Args: {
          p_campaign: string
          p_channel: string
          p_ends_on: string
          p_name: string
          p_notes: string
          p_objective: string
          p_starts_on: string
          p_status: string
          p_tenant: string
        }
        Returns: undefined
      }
      growth_update_creative: {
        Args: {
          p_channel: string
          p_creative: string
          p_cta: string
          p_headline: string
          p_message: string
          p_name: string
          p_status: string
          p_tenant: string
        }
        Returns: undefined
      }
      growth_update_feedback: {
        Args: { p_feedback: string; p_status: string; p_tenant: string }
        Returns: undefined
      }
      growth_update_review: {
        Args: {
          p_response: string
          p_review: string
          p_status: string
          p_tenant: string
        }
        Returns: undefined
      }
      growth_update_site: {
        Args: {
          p_domain: string
          p_name: string
          p_notes: string
          p_site: string
          p_slug: string
          p_status: string
          p_tenant: string
        }
        Returns: undefined
      }
      growth_update_submission: {
        Args: { p_status: string; p_submission: string; p_tenant: string }
        Returns: undefined
      }
      has_consent: {
        Args: { p_channel: string; p_contact: string; p_tenant: string }
        Returns: boolean
      }
      has_tenant_access: { Args: { target_tenant: string }; Returns: boolean }
      has_tenant_role: {
        Args: { allowed_roles: string[]; target_tenant: string }
        Returns: boolean
      }
      inbox_assign_conversation: {
        Args: { p_conversation: string; p_tenant: string; p_user_id: string }
        Returns: undefined
      }
      inbox_create_conversation: {
        Args: {
          p_assigned_to?: string
          p_channel_id?: string
          p_contact_id?: string
          p_customer_email?: string
          p_customer_name?: string
          p_subject?: string
          p_tenant: string
        }
        Returns: string
      }
      inbox_mark_read: {
        Args: { p_conversation: string; p_tenant: string }
        Returns: undefined
      }
      inbox_metrics: { Args: { p_tenant: string }; Returns: Json }
      inbox_record_webhook: {
        Args: {
          p_event_type: string
          p_external_id: string
          p_payload: Json
          p_provider: string
          p_tenant: string
        }
        Returns: boolean
      }
      inbox_send_message: {
        Args: {
          p_content: string
          p_conversation: string
          p_external_id?: string
          p_is_internal?: boolean
          p_message_type?: string
          p_tenant: string
        }
        Returns: string
      }
      inbox_set_conversation_status: {
        Args: { p_conversation: string; p_status: string; p_tenant: string }
        Returns: undefined
      }
      integrations_disconnect_secret: {
        Args: { p_provider: string; p_secret_name: string; p_tenant: string }
        Returns: undefined
      }
      integrations_list_secret_meta: {
        Args: { p_tenant: string }
        Returns: {
          created_at: string
          id: string
          last_error: string
          last_verified_at: string
          provider: string
          secret_name: string
          status: string
          updated_at: string
        }[]
      }
      is_active_member: {
        Args: { p_tenant: string; p_user: string }
        Returns: boolean
      }
      is_platform_admin: {
        Args: { allowed_roles?: string[] }
        Returns: boolean
      }
      move_deal_stage: {
        Args: { p_deal: string; p_stage_id: string; p_tenant: string }
        Returns: undefined
      }
      normalize_lead_mobile: { Args: { p_mobile: string }; Returns: string }
      notifications_list: {
        Args: { p_limit?: number; p_offset?: number; p_tenant: string }
        Returns: Json
      }
      notifications_mark_all_read: {
        Args: { p_tenant: string }
        Returns: undefined
      }
      notifications_mark_read: {
        Args: { p_notification: string; p_tenant: string }
        Returns: undefined
      }
      notifications_unread_count: {
        Args: { p_tenant: string }
        Returns: number
      }
      notify_booking_users: {
        Args: {
          p_appointment?: string
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_tenant: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      oauth_state_consume: {
        Args: {
          p_provider?: string
          p_state_token: string
          p_tenant: string
          p_user_id?: string
        }
        Returns: boolean
      }
      oauth_state_create: {
        Args: {
          p_provider?: string
          p_redirect_path?: string
          p_tenant: string
        }
        Returns: {
          expires_at: string
          state_token: string
        }[]
      }
      patient_document_audit_record: {
        Args: {
          p_action: string
          p_contact: string
          p_content_type?: string
          p_object_path: string
          p_tenant: string
          p_user: string
        }
        Returns: undefined
      }
      patient_document_path_uuid: {
        Args: { p_index: number; p_name: string }
        Returns: string
      }
      patient_email_claim_due: { Args: { p_limit?: number }; Returns: Json }
      patient_email_contact_opted_out: {
        Args: { p_contact: string; p_tenant: string }
        Returns: boolean
      }
      patient_email_enqueue: {
        Args: {
          p_appointment?: string
          p_dedupe: string
          p_kind: string
          p_review_request?: string
          p_send_after: string
          p_start_at?: string
          p_tenant: string
          p_to: string
        }
        Returns: undefined
      }
      patient_email_mark_result: {
        Args: {
          p_error?: string
          p_id: string
          p_ok: boolean
          p_provider?: string
          p_provider_message_id?: string
        }
        Returns: undefined
      }
      patient_email_update_settings: {
        Args: {
          p_confirmations_enabled: boolean
          p_reminder_hours_before: number
          p_reminders_enabled: boolean
          p_reply_to_email?: string
          p_review_emails_auto_approve: boolean
          p_tenant: string
        }
        Returns: undefined
      }
      patient_medical_history_add: {
        Args: {
          p_allergies: string
          p_conditions: string
          p_consent_given: boolean
          p_consent_version?: string
          p_contact: string
          p_family_history: string
          p_medications: string
          p_notes: string
          p_past_treatments: string
          p_tenant: string
        }
        Returns: string
      }
      patient_medical_history_list: {
        Args: { p_contact: string; p_tenant: string }
        Returns: {
          allergies: string
          conditions: string
          consent_given_at: string
          consent_version: string
          contact_id: string
          family_history: string
          id: string
          medications: string
          notes: string
          past_treatments: string
          recorded_at: string
          recorded_by: string
        }[]
      }
      payments_compute_invoice_totals: {
        Args: { p_discount: number; p_items: Json; p_tax: number }
        Returns: {
          discount_amount: number
          subtotal: number
          tax_amount: number
          total_amount: number
        }[]
      }
      payments_create_invoice: {
        Args: {
          p_contact: string
          p_currency: string
          p_discount_amount: number
          p_due_date: string
          p_issue_date: string
          p_line_items: Json
          p_notes: string
          p_status: string
          p_tax_amount: number
          p_tenant: string
          p_title: string
        }
        Returns: string
      }
      payments_delete_invoice: {
        Args: { p_invoice: string; p_tenant: string }
        Returns: undefined
      }
      payments_gateway_status: { Args: { p_tenant: string }; Returns: Json }
      payments_list_invoice_orders: {
        Args: { p_invoice: string; p_tenant: string }
        Returns: {
          amount_paise: number
          created_at: string
          currency: string
          id: string
          paid_at: string
          provider_order_id: string
          status: string
        }[]
      }
      payments_record_payment: {
        Args: {
          p_amount: number
          p_invoice: string
          p_method: string
          p_notes: string
          p_paid_at: string
          p_reference: string
          p_tenant: string
        }
        Returns: string
      }
      payments_refresh_invoice_status: {
        Args: { p_invoice: string; p_tenant: string }
        Returns: undefined
      }
      payments_service_create_invoice_order: {
        Args: {
          p_amount_paise: number
          p_created_by: string
          p_currency: string
          p_invoice: string
          p_provider_order_id: string
          p_receipt: string
          p_tenant: string
        }
        Returns: string
      }
      payments_service_finish_invoice_webhook_event: {
        Args: {
          p_error?: string
          p_provider_event_id: string
          p_status: string
        }
        Returns: undefined
      }
      payments_service_mark_invoice_order_failed: {
        Args: { p_error: string; p_provider_order_id: string }
        Returns: undefined
      }
      payments_service_record_invoice_webhook_event: {
        Args: {
          p_event_type: string
          p_payload: Json
          p_provider_event_id: string
          p_tenant: string
        }
        Returns: boolean
      }
      payments_service_record_online_payment: {
        Args: {
          p_amount_paise: number
          p_provider_order_id: string
          p_provider_payment_id: string
          p_tenant: string
        }
        Returns: string
      }
      payments_update_invoice: {
        Args: {
          p_contact: string
          p_currency: string
          p_discount_amount: number
          p_due_date: string
          p_invoice: string
          p_issue_date: string
          p_line_items: Json
          p_notes: string
          p_status: string
          p_tax_amount: number
          p_tenant: string
          p_title: string
        }
        Returns: undefined
      }
      provider_connections_status: {
        Args: { p_tenant: string }
        Returns: {
          connected: boolean
          display_name: string
          identifier: string
          kind: string
          last_error: string
          provider: string
          secret_name: string
          status: string
          updated_at: string
        }[]
      }
      public_booking_create: {
        Args: {
          p_customer_email?: string
          p_customer_name: string
          p_customer_phone: string
          p_idempotency_key?: string
          p_notes?: string
          p_resource_id?: string
          p_service_id: string
          p_slug: string
          p_start_at: string
        }
        Returns: Json
      }
      public_booking_get_page: { Args: { p_slug: string }; Returns: Json }
      public_booking_get_slots: {
        Args: {
          p_date: string
          p_resource_id?: string
          p_service_id: string
          p_slug: string
        }
        Returns: Json
      }
      public_booking_manage: {
        Args: {
          p_action: string
          p_reason?: string
          p_start_at?: string
          p_token: string
        }
        Returns: Json
      }
      public_review_get: { Args: { p_token: string }; Returns: Json }
      public_review_mark_clicked: {
        Args: { p_token: string }
        Returns: undefined
      }
      public_review_submit_feedback: {
        Args: { p_feedback?: string; p_rating: number; p_token: string }
        Returns: Json
      }
      review_request_ensure_token: {
        Args: { p_request: string; p_tenant: string }
        Returns: string
      }
      review_request_set_status: {
        Args: { p_request: string; p_status: string; p_tenant: string }
        Returns: undefined
      }
      sales_add_signal: {
        Args: {
          p_prospect: string
          p_signal_type: string
          p_source_url: string
          p_summary: string
          p_tenant: string
        }
        Returns: string
      }
      sales_add_suppression: {
        Args: {
          p_email: string
          p_reason: string
          p_source: string
          p_tenant: string
        }
        Returns: undefined
      }
      sales_campaign_summary: {
        Args: { p_campaign: string; p_tenant: string }
        Returns: Json
      }
      sales_convert_prospect_to_contact: {
        Args: { p_prospect: string; p_tenant: string }
        Returns: string
      }
      sales_create_campaign: {
        Args: {
          p_name: string
          p_objective: string
          p_problem_addressed: string
          p_product_offered: string
          p_prospect_ids: Json
          p_tenant: string
          p_tone: string
        }
        Returns: Json
      }
      sales_create_decision_maker: {
        Args: {
          p_email: string
          p_full_name: string
          p_job_title: string
          p_linkedin_url: string
          p_phone: string
          p_prospect: string
          p_research_source: string
          p_tenant: string
        }
        Returns: string
      }
      sales_create_prospect: {
        Args: {
          p_assigned_to?: string
          p_business_name: string
          p_business_size?: string
          p_city?: string
          p_contact_person?: string
          p_country?: string
          p_email?: string
          p_industry?: string
          p_notes?: string
          p_phone?: string
          p_source?: string
          p_source_reference?: string
          p_state?: string
          p_tenant: string
          p_website?: string
        }
        Returns: string
      }
      sales_dashboard_metrics: { Args: { p_tenant: string }; Returns: Json }
      sales_delete_decision_maker: {
        Args: { p_decision_maker: string; p_tenant: string }
        Returns: undefined
      }
      sales_delete_prospect: {
        Args: { p_prospect: string; p_tenant: string }
        Returns: undefined
      }
      sales_delete_reply: {
        Args: { p_reply: string; p_tenant: string }
        Returns: undefined
      }
      sales_delete_signal: {
        Args: { p_signal: string; p_tenant: string }
        Returns: undefined
      }
      sales_find_duplicate_prospect: {
        Args: {
          p_business_name?: string
          p_city?: string
          p_country?: string
          p_email?: string
          p_tenant: string
          p_website?: string
        }
        Returns: string
      }
      sales_import_prospects: {
        Args: { p_rows: Json; p_source?: string; p_tenant: string }
        Returns: Json
      }
      sales_is_suppressed: {
        Args: { p_email: string; p_tenant: string }
        Returns: boolean
      }
      sales_mark_outbox_failed: {
        Args: { p_error: string; p_outbox: string; p_tenant: string }
        Returns: undefined
      }
      sales_normalize_website: { Args: { p_website: string }; Returns: string }
      sales_queue_approved_email: {
        Args: { p_message: string; p_tenant: string }
        Returns: string
      }
      sales_record_reply: {
        Args: {
          p_body: string
          p_campaign: string
          p_classification: string
          p_external_id?: string
          p_message: string
          p_prospect: string
          p_received_at?: string
          p_sender_email: string
          p_subject: string
          p_tenant: string
        }
        Returns: string
      }
      sales_record_verification: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_evidence?: Json
          p_method: string
          p_status: string
          p_tenant: string
        }
        Returns: string
      }
      sales_retry_outbox: {
        Args: { p_outbox: string; p_tenant: string }
        Returns: undefined
      }
      sales_review_email_draft: {
        Args: {
          p_decision: string
          p_edited_body: string
          p_edited_subject: string
          p_message: string
          p_reason: string
          p_tenant: string
        }
        Returns: undefined
      }
      sales_save_email_draft: {
        Args: {
          p_body: string
          p_cta: string
          p_decision_maker: string
          p_follow_up_body: string
          p_follow_up_subject: string
          p_generation_source?: string
          p_message: string
          p_opening: string
          p_subject: string
          p_tenant: string
        }
        Returns: undefined
      }
      sales_save_search: {
        Args: {
          p_criteria: Json
          p_name: string
          p_provider?: string
          p_search?: string
          p_tenant: string
        }
        Returns: string
      }
      sales_set_prospect_lead_status: {
        Args: { p_prospect: string; p_status: string; p_tenant: string }
        Returns: undefined
      }
      sales_submit_for_approval: {
        Args: { p_message: string; p_tenant: string }
        Returns: undefined
      }
      sales_update_decision_maker: {
        Args: {
          p_decision_maker: string
          p_email: string
          p_full_name: string
          p_job_title: string
          p_linkedin_url: string
          p_phone: string
          p_research_source: string
          p_tenant: string
        }
        Returns: undefined
      }
      sales_update_prospect: {
        Args: {
          p_assigned_to?: string
          p_business_name: string
          p_business_size?: string
          p_city?: string
          p_contact_person?: string
          p_country?: string
          p_email?: string
          p_industry?: string
          p_notes?: string
          p_phone?: string
          p_prospect: string
          p_state?: string
          p_tenant: string
          p_website?: string
        }
        Returns: undefined
      }
      sales_update_reply: {
        Args: {
          p_classification: string
          p_reply: string
          p_reply_status: string
          p_tenant: string
        }
        Returns: undefined
      }
      tasks_create_task: {
        Args: {
          p_assigned_to: string
          p_description: string
          p_due_at: string
          p_tenant: string
          p_title: string
        }
        Returns: string
      }
      tasks_delete_task: {
        Args: { p_task: string; p_tenant: string }
        Returns: undefined
      }
      tasks_set_status: {
        Args: { p_status: string; p_task: string; p_tenant: string }
        Returns: undefined
      }
      tasks_update_task: {
        Args: {
          p_assigned_to: string
          p_description: string
          p_due_at: string
          p_task: string
          p_tenant: string
          p_title: string
        }
        Returns: undefined
      }
      update_contact: {
        Args: {
          p_area?: string
          p_clinic?: string
          p_company?: string
          p_contact: string
          p_email?: string
          p_first_name: string
          p_follow_up_at?: string
          p_google_maps_url?: string
          p_last_name?: string
          p_lead_status?: string
          p_mobile?: string
          p_notes?: string
          p_phone?: string
          p_rating?: number
          p_reply_1?: string
          p_reviews?: number
          p_sent?: boolean
          p_status?: string
          p_tenant: string
          p_why_included?: string
        }
        Returns: undefined
      }
      validate_deal_stage: {
        Args: { p_pipeline_id: string; p_stage_id: string; p_tenant: string }
        Returns: undefined
      }
      voice_create_handoff: {
        Args: {
          p_assigned_to: string
          p_call_session: string
          p_notes: string
          p_reason: string
          p_tenant: string
        }
        Returns: string
      }
      voice_log_call_session: {
        Args: {
          p_agent: string
          p_consent_recording: boolean
          p_contact: string
          p_direction: string
          p_duration_seconds: number
          p_ended_at: string
          p_from_number: string
          p_language: string
          p_needs_handoff: boolean
          p_outcome: string
          p_provider: string
          p_started_at: string
          p_status: string
          p_summary: string
          p_tenant: string
          p_to_number: string
        }
        Returns: string
      }
      voice_resolve_handoff: {
        Args: { p_handoff: string; p_tenant: string }
        Returns: undefined
      }
      voice_upsert_agent: {
        Args: {
          p_agent: string
          p_booking_mode: string
          p_direction: string
          p_faq_summary: string
          p_greeting: string
          p_handoff_phone: string
          p_languages: string[]
          p_name: string
          p_provider: string
          p_provider_phone_number: string
          p_status: string
          p_tenant: string
        }
        Returns: string
      }
      workflows_create: {
        Args: {
          p_actions?: Json
          p_description?: string
          p_name: string
          p_status?: string
          p_tenant: string
          p_trigger_config?: Json
          p_trigger_type?: string
        }
        Returns: string
      }
      workflows_delete: {
        Args: { p_tenant: string; p_workflow: string }
        Returns: undefined
      }
      workflows_execute_local_actions: {
        Args: {
          p_actor?: string
          p_payload: Json
          p_source_id: string
          p_source_table: string
          p_tenant: string
          p_trigger_type: string
          p_workflow: string
        }
        Returns: string
      }
      workflows_run_manual: {
        Args: { p_payload?: Json; p_tenant: string; p_workflow: string }
        Returns: string
      }
      workflows_set_status: {
        Args: { p_status: string; p_tenant: string; p_workflow: string }
        Returns: undefined
      }
      workflows_update: {
        Args: {
          p_actions?: Json
          p_description?: string
          p_name: string
          p_status?: string
          p_tenant: string
          p_trigger_config?: Json
          p_trigger_type?: string
          p_workflow: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
