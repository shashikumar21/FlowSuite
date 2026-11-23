import { describe, expect, it } from 'vitest'
import calendarSql from '../../../supabase/migrations/0025_calendar_google_connection.sql?raw'
import vaultSql from '../../../supabase/migrations/0033_integration_secret_vault.sql?raw'
import runtimeSql from '../../../supabase/migrations/0042_provider_connection_runtime.sql?raw'

/**
 * These are static contract checks. No local Postgres is available here, so
 * the migration is not executed; a deliberate hosted promotion still needs a
 * rolled-back smoke test. The checks guard the tenant/secret boundary.
 */

function block(sql: string, start: string, end: string): string {
  const from = sql.indexOf(start)
  const to = sql.indexOf(end, from + start.length)
  if (from < 0 || to < 0) throw new Error(`Missing SQL block: ${start} -> ${end}`)
  return sql.slice(from, to)
}

describe('provider connection runtime SQL contract', () => {
  it('keeps vault ciphertext out of client-reachable surfaces', () => {
    expect(vaultSql).toContain('revoke all on public.integration_secrets from public, anon, authenticated')
    expect(vaultSql).not.toMatch(/create\s+policy.*integration_secrets/i)
    expect(vaultSql).toContain('drop view if exists public.integration_secrets_meta')
    expect(vaultSql).toContain('integrations_list_secret_meta')
    const listFn = block(vaultSql, 'create or replace function public.integrations_list_secret_meta', 'create or replace function public.integrations_disconnect_secret')
    expect(listFn).not.toMatch(/ciphertext|\biv\b|access_token|refresh_token/i)
  })

  it('keeps calendar tokens out of client-reachable surfaces', () => {
    expect(calendarSql).toContain('revoke all on public.calendar_connections from public, anon, authenticated')
    expect(calendarSql).not.toMatch(/create\s+policy.*calendar_connections/i)
    const status = block(calendarSql, 'create or replace function public.calendar_connection_status', '-- Disconnect (owner/admin/manager)')
    expect(status).not.toMatch(/access_token|refresh_token|token_expires_at/i)
    expect(calendarSql).toContain('grant execute on function public.calendar_connection_status(uuid, text) to authenticated')
  })

  it('exposes unified status without tokens or ciphertext', () => {
    const status = block(runtimeSql, 'create or replace function public.provider_connections_status', 'revoke all on function public.provider_connections_status')
    const output = block(status, 'returns table (', 'language plpgsql')
    expect(status).toContain('if not public.has_tenant_access(p_tenant) then raise exception')
    expect(status).toContain('from public.calendar_connections')
    expect(status).toContain('from public.integration_secrets')
    expect(output).not.toMatch(/access_token|refresh_token|ciphertext|\biv\b/i)
    expect(status).not.toMatch(/access_token|refresh_token/i)
    expect(runtimeSql).toContain('grant execute on function public.provider_connections_status(uuid) to authenticated')
  })

  it('audits only metadata for connection changes', () => {
    const audit = block(runtimeSql, 'create or replace function public.provider_connection_audit', 'revoke all on function public.provider_connection_audit')
    expect(audit).toContain("'provider_connection', v_entity_id, v_metadata")
    expect(audit).toContain("'external_call', false")
    expect(audit).toContain("'auto_send', false")
    expect(audit).not.toContain("'access_token',")
    expect(audit).not.toContain("'refresh_token',")
    expect(audit).not.toContain("'ciphertext',")
    expect(audit).not.toContain("'iv',")
    expect(runtimeSql).toContain('after insert or update or delete on public.integration_secrets')
    expect(runtimeSql).toContain('after insert or update or delete on public.calendar_connections')
  })

  it('stores OAuth state tenant-safely, briefly and single-use', () => {
    const state = block(runtimeSql, 'create table if not exists public.oauth_connection_states', 'create or replace function public.oauth_state_create')
    expect(state).toContain('tenant_id uuid not null references public.businesses(id) on delete cascade')
    expect(state).toContain('expires_at timestamptz not null')
    expect(state).toContain('used_at timestamptz')
    expect(state).toContain('alter table public.oauth_connection_states enable row level security')
    expect(state).toContain('revoke all on public.oauth_connection_states from public, anon, authenticated')
    expect(state).not.toMatch(/create\s+policy/i)

    const create = block(runtimeSql, 'create or replace function public.oauth_state_create', 'create or replace function public.oauth_state_consume')
    expect(create).toContain('returning s.id, s.state_token, s.expires_at')
    expect(create).toContain('auth.uid()')

    const consume = block(runtimeSql, 'create or replace function public.oauth_state_consume', 'revoke all on function public.oauth_state_consume')
    expect(consume).toContain('public.has_tenant_access(p_tenant)')
    expect(consume).toContain('public.has_tenant_role(p_tenant')
    expect(consume).toContain('used_at is null')
    expect(consume).toContain('expires_at > now()')
    expect(consume).toContain('for update skip locked')
    expect(consume).toContain('set used_at = now()')
    expect(consume).toContain("v_role <> 'service_role'")
  })

  it('uses the documented booking role gate and allows no client writes', () => {
    const disconnect = block(runtimeSql, 'create or replace function public.calendar_connection_disconnect', 'revoke all on function public.calendar_connection_disconnect')
    expect(disconnect).toContain('public.can_manage_bookings(p_tenant)')
    expect(disconnect).not.toContain("array['owner','admin','manager']")
    expect(runtimeSql).toContain('grant execute on function public.calendar_connection_disconnect(uuid, text) to authenticated')
    expect(runtimeSql).not.toMatch(/grant\s+(select|insert|update|delete).*on public\.(integration_secrets|calendar_connections|oauth_connection_states)/i)
  })

  it('adds no provider call, send path, scheduler or client key', () => {
    expect(runtimeSql).toContain('LOCAL ONLY')
    expect(runtimeSql).not.toMatch(/vite_|https?:\/\/|fetch\(|functions\.invoke|whatsapp-webhook|razorpay|stripe/i)
    expect(runtimeSql).not.toMatch(/insert into\s+public\.(messages|notifications|email_queue|sms_queue)/i)
  })
})
