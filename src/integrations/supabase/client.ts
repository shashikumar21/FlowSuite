import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && publishableKey)

const client: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url as string, publishableKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'flowsuite-auth',
      },
    })
  : null

/** The configured client. Call only after checking `isSupabaseConfigured`. */
export const supabase = client

/** Fails loudly instead of silently rendering an unauthenticated UI. */
export function requireSupabase(): SupabaseClient<Database> {
  if (!client) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    )
  }
  return client
}

export const APP_NAME = import.meta.env.VITE_APP_NAME?.trim() || 'FlowSuite'
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL?.trim() || 'support@flow-suit.com'
