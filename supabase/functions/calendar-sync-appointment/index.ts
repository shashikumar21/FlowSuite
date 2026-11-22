// Google Calendar Phase 2 v1: FlowSuite -> Google appointment sync.
// Auth: tenant member JWT, or public manage_token for self-service flows.
// NOT DEPLOYED until explicit approval. Server-side secrets only.

import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '../_shared/ai/store.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

const payloadSchema = z.object({
  tenant_id: z.string().uuid().optional(),
  appointment_id: z.string().uuid(),
  manage_token: z.string().min(10).max(500).optional(),
})

type Appointment = {
  id: string
  tenant_id: string
  service_id: string | null
  resource_id: string | null
  title: string
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  notes: string | null
  start_at: string
  end_at: string
  status: string
  manage_token: string | null
}

type Connection = {
  id: string
  tenant_id: string
  provider: string
  calendar_id: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  status: string
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

async function getAuthedUserId(req: Request): Promise<string | null> {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

async function ensureTenantMember(tenantId: string, userId: string): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // Use service role for membership check to be reliable in edge context
  const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data } = await admin.from('business_members')
    .select('user_id')
    .eq('tenant_id', tenantId).eq('user_id', userId).eq('status', 'active')
    .maybeSingle()
  return !!data
}

async function refreshAccessToken(conn: Connection, admin: ReturnType<typeof createServiceClient>): Promise<string> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('Google OAuth not configured on server')
  if (!conn.refresh_token) throw new Error('Missing Google refresh token; reconnect Google Calendar')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${typeof json.error === 'string' ? json.error : res.status}`)
  }
  const accessToken = typeof json.access_token === 'string' ? json.access_token : ''
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600
  if (!accessToken) throw new Error('Google token refresh returned no access token')
  await admin.from('calendar_connections').update({
    access_token: accessToken,
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    status: 'connected',
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', conn.id)
  return accessToken
}

async function getAccessToken(conn: Connection, admin: ReturnType<typeof createServiceClient>): Promise<string> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  if (conn.access_token && expiresAt > Date.now() + 60_000) return conn.access_token
  return await refreshAccessToken(conn, admin)
}

function buildEvent(appt: Appointment, serviceName: string | null, timezone: string) {
  const summary = [serviceName, appt.customer_name].filter(Boolean).join(' - ') || appt.title || 'Appointment'
  const descriptionLines = [
    appt.customer_name ? `Customer: ${appt.customer_name}` : null,
    appt.customer_phone ? `Phone: ${appt.customer_phone}` : null,
    appt.customer_email ? `Email: ${appt.customer_email}` : null,
    `FlowSuite appointment ID: ${appt.id}`,
    `Status: ${appt.status}`,
  ].filter(Boolean)
  return {
    summary: summary.slice(0, 250),
    description: descriptionLines.join('\n').slice(0, 2000),
    start: { dateTime: appt.start_at, timeZone: timezone },
    end: { dateTime: appt.end_at, timeZone: timezone },
  }
}

async function googleApi(token: string, path: string, init?: RequestInit): Promise<Response> {
  return await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return errorResponse(503, 'service_unavailable', 'Supabase server configuration is missing')

  let raw: unknown
  try { raw = await req.json() } catch { return errorResponse(400, 'invalid_json') }
  const parsed = payloadSchema.safeParse(raw)
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid request')

  const { tenant_id, appointment_id, manage_token } = parsed.data
  const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let apptQuery = admin.from('appointments')
    .select('id,tenant_id,service_id,resource_id,title,customer_name,customer_email,customer_phone,notes,start_at,end_at,status,manage_token')
    .eq('id', appointment_id)
  if (tenant_id) apptQuery = apptQuery.eq('tenant_id', tenant_id)
  const { data: appt, error: apptErr } = await apptQuery.maybeSingle<Appointment>()
  if (apptErr) return errorResponse(500, 'appointment_lookup_failed')
  if (!appt) return errorResponse(404, 'not_found', 'Appointment not found')

  const tenantId = appt.tenant_id

  // Auth: tenant member JWT or valid manage token
  const userId = await getAuthedUserId(req)
  let authorized = false
  if (userId) authorized = await ensureTenantMember(tenantId, userId)
  if (!authorized && manage_token && appt.manage_token && manage_token === appt.manage_token) authorized = true
  if (!authorized) return errorResponse(403, 'forbidden')

  const { data: conn } = await admin.from('calendar_connections')
    .select('id,tenant_id,provider,calendar_id,access_token,refresh_token,token_expires_at,status')
    .eq('tenant_id', tenantId).eq('provider', 'google').maybeSingle<Connection>()

  if (!conn || conn.status !== 'connected') {
    return jsonResponse({ synced: false, reason: 'not_connected' })
  }

  const { data: mapping } = await admin.from('calendar_event_mappings')
    .select('id,google_event_id,sync_status')
    .eq('appointment_id', appointment_id).eq('provider', 'google').maybeSingle<{ id: string; google_event_id: string | null; sync_status: string }>()

  const shouldCancel = ['cancelled', 'no_show'].includes(appt.status)

  try {
    const accessToken = await getAccessToken(conn, admin)
    const calendarId = encodeURIComponent(conn.calendar_id || 'primary')

    if (shouldCancel) {
      if (mapping?.google_event_id) {
        const del = await googleApi(accessToken, `/calendars/${calendarId}/events/${encodeURIComponent(mapping.google_event_id)}`, { method: 'DELETE' })
        if (!del.ok && del.status !== 404 && del.status !== 410) {
          const body = await del.text().catch(() => '')
          throw new Error(`Google delete failed: ${del.status} ${body.slice(0, 200)}`)
        }
      }
      await admin.from('calendar_event_mappings').upsert({
        tenant_id: tenantId, appointment_id, provider: 'google',
        google_event_id: mapping?.google_event_id ?? null,
        sync_status: 'cancelled', last_error: null, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'appointment_id,provider' })
      await admin.from('calendar_connections').update({ last_synced_at: new Date().toISOString(), last_error: null, status: 'connected' }).eq('id', conn.id)
      return jsonResponse({ synced: true, action: 'cancelled' })
    }

    const [{ data: service }, { data: business }] = await Promise.all([
      appt.service_id ? admin.from('services').select('name').eq('id', appt.service_id).maybeSingle<{ name: string }>() : Promise.resolve({ data: null }),
      admin.from('businesses').select('timezone').eq('id', tenantId).maybeSingle<{ timezone: string | null }>(),
    ])
    const timezone = business?.timezone || 'Asia/Kolkata'
    const event = buildEvent(appt, service?.name ?? null, timezone)

    let googleEventId = mapping?.google_event_id ?? null
    if (googleEventId) {
      const put = await googleApi(accessToken, `/calendars/${calendarId}/events/${encodeURIComponent(googleEventId)}`, {
        method: 'PUT', body: JSON.stringify(event),
      })
      if (put.status === 404 || put.status === 410) {
        googleEventId = null // recreate below
      } else if (!put.ok) {
        const body = await put.text().catch(() => '')
        throw new Error(`Google update failed: ${put.status} ${body.slice(0, 200)}`)
      }
    }
    if (!googleEventId) {
      const post = await googleApi(accessToken, `/calendars/${calendarId}/events`, {
        method: 'POST', body: JSON.stringify(event),
      })
      const body = await post.json().catch(() => ({})) as Record<string, unknown>
      if (!post.ok || typeof body.id !== 'string') {
        throw new Error(`Google create failed: ${post.status}`)
      }
      googleEventId = body.id
    }

    await admin.from('calendar_event_mappings').upsert({
      tenant_id: tenantId, appointment_id, provider: 'google',
      google_event_id: googleEventId,
      sync_status: 'synced', last_error: null, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'appointment_id,provider' })
    await admin.from('calendar_connections').update({ last_synced_at: new Date().toISOString(), last_error: null, status: 'connected' }).eq('id', conn.id)
    return jsonResponse({ synced: true, action: mapping?.google_event_id ? 'updated' : 'created', google_event_id: googleEventId })
  } catch (e) {
    const message = errMsg(e).slice(0, 500)
    console.error('calendar-sync-appointment failed', message)
    await admin.from('calendar_event_mappings').upsert({
      tenant_id: tenantId, appointment_id, provider: 'google',
      google_event_id: mapping?.google_event_id ?? null,
      sync_status: 'error', last_error: message, updated_at: new Date().toISOString(),
    }, { onConflict: 'appointment_id,provider' })
    await admin.from('calendar_connections').update({ last_error: message, status: 'error' }).eq('id', conn.id)
    return errorResponse(502, 'sync_failed', message)
  }
})
