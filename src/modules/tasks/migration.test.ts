import { describe, expect, it } from 'vitest'
import sql from '../../../supabase/migrations/0022_tasks_module.sql?raw'

/**
 * The migration cannot be executed here (no local Postgres), so these checks
 * guard the security contract statically until a deliberate local/hosted
 * promotion can be verified with a real database.
 */

describe('0022_tasks_module.sql contract', () => {
  it('extends the existing tasks table instead of recreating it', () => {
    expect(sql).toContain('alter table public.tasks add column if not exists created_by uuid')
    expect(sql).not.toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.tasks/i)
  })

  it('gives the browser SELECT only and tenant-scoped RLS', () => {
    expect(sql).toContain('drop policy if exists "Tenant tasks access" on public.tasks')
    expect(sql).toContain('create policy "Tasks: read tenant tasks" on public.tasks')
    expect(sql).toContain('for select to authenticated using (public.has_tenant_access(tenant_id))')
    expect(sql).toContain('revoke all on public.tasks from public, anon, authenticated')
    expect(sql).toContain('grant select on public.tasks to authenticated')
    expect(sql).not.toContain('for all to authenticated')
  })

  it('rechecks tenant membership and owner/admin permission on the server', () => {
    expect(sql).toContain('if not public.has_tenant_access(p_tenant) then raise exception')
    expect(sql).toContain("if not public.can_manage_sales_agent(p_tenant) then")
    expect(sql).toContain('Only an owner or admin can delete a task')
    expect(sql).toContain("bm.status = 'active'")
  })

  it('stamps completion on the server and never trusts client completion fields', () => {
    expect(sql).toContain('completed_by = v_caller, completed_at = now()')
    expect(sql).not.toMatch(/p_completed_by|p_completed_at|p_created_by|p_role|p_permission/i)
  })

  it('adds no provider, key, scheduler or real send path', () => {
    expect(sql).not.toMatch(/vite_|sendgrid|twilio|whatsapp|razorpay|stripe|openai|groq/i)
    expect(sql).not.toMatch(/insert into\s+public\.(notification|email|sms)/i)
  })
})
