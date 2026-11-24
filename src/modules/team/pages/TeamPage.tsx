import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, MailPlus, ShieldAlert, Trash2, UserPlus } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { requireSupabase } from '@/integrations/supabase/client'
import { getErrorMessage } from '@/lib/errors'
import { ROLE_LABELS } from '@/lib/permissions'
import { formatDate } from '@/lib/format'
import type { InvitationRow, MemberStatus, TenantRole } from '@/types/database'
import { z } from 'zod'

type MemberRow = {
  id: string
  user_id: string
  role: TenantRole
  status: MemberStatus
  created_at: string
  profiles: { full_name: string | null; phone: string | null } | null
}

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  role: z.enum(['admin', 'manager', 'doctor', 'employee']),
})
type InviteValues = z.infer<typeof inviteSchema>

export function TeamPage() {
  const { activeTenant, can } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [latestLink, setLatestLink] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<MemberRow | null>(null)

  const inviteForm = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'employee' },
  })

  const query = useQuery({
    queryKey: ['team', tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const supabase = requireSupabase()
      const id = tenantId as string
      const [members, invitations] = await Promise.all([
        supabase
          .from('business_members')
          .select('id, user_id, role, status, created_at, profiles(full_name, phone)')
          .eq('tenant_id', id)
          .order('created_at')
          .returns<MemberRow[]>(),
        supabase
          .from('business_invitations')
          .select('*')
          .eq('tenant_id', id)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .returns<InvitationRow[]>(),
      ])
      const error = members.error ?? invitations.error
      if (error) throw error
      return { members: members.data ?? [], invitations: invitations.data ?? [] }
    },
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['team', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard', tenantId] })
  }

  const onInvite = inviteForm.handleSubmit(async (values) => {
    setActionError(null)
    try {
      const { data, error } = await requireSupabase().rpc('create_business_invitation', {
        p_tenant_id: tenantId as string,
        p_email: values.email,
        p_role: values.role,
      })
      if (error) throw error
      setLatestLink(`${window.location.origin}/invite/${data}`)
      inviteForm.reset()
      invalidate()
      toast({ title: 'Invitation created', description: 'Share the link below with your teammate.' })
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  })

  const changeRole = async (member: MemberRow, role: TenantRole) => {
    setActionError(null)
    const { error } = await requireSupabase()
      .from('business_members')
      .update({ role })
      .eq('id', member.id)
      .eq('tenant_id', tenantId as string)
    if (error) {
      setActionError(error.message)
      toast({ title: 'Role change failed', description: error.message, variant: 'error' })
      return
    }
    toast({ title: 'Role updated', description: `${member.profiles?.full_name ?? 'Member'} is now ${ROLE_LABELS[role]}.` })
    invalidate()
  }

  const removeMember = async () => {
    if (!memberToRemove) return
    setActionError(null)
    const { error } = await requireSupabase()
      .from('business_members')
      .delete()
      .eq('id', memberToRemove.id)
      .eq('tenant_id', tenantId as string)
    setMemberToRemove(null)
    if (error) {
      setActionError(error.message)
      toast({ title: 'Could not remove member', description: error.message, variant: 'error' })
      return
    }
    toast({ title: 'Member removed' })
    invalidate()
  }

  const revokeInvitation = async (invitation: InvitationRow) => {
    const { error } = await requireSupabase()
      .from('business_invitations')
      .delete()
      .eq('id', invitation.id)
      .eq('tenant_id', tenantId as string)
    if (error) {
      toast({ title: 'Could not revoke invitation', description: error.message, variant: 'error' })
      return
    }
    toast({ title: 'Invitation revoked' })
    invalidate()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Team</h1>
          <p className="mt-1 text-sm text-ink-500">Manage who can work inside this business and what they can do.</p>
        </div>
        {can('manage_team') ? (
          <Button onClick={() => { setActionError(null); setLatestLink(null); setInviteOpen(true) }}>
            <UserPlus className="size-4" /> Invite member
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {actionError}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Owners and admins manage the team. Employees only work within this tenant.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {query.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-14" />)}</div>
          ) : query.isError ? (
            <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : query.data?.members.length ? (
            <ul className="divide-y divide-ink-100">
              {query.data.members.map((member) => {
                const editable = can('manage_team') && member.role !== 'owner'
                return (
                  <li key={member.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                    <Avatar name={member.profiles?.full_name ?? member.user_id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{member.profiles?.full_name ?? 'Team member'}</p>
                      <p className="text-xs text-ink-500">
                        Joined {formatDate(member.created_at)} · {member.profiles?.phone ?? 'No phone'}
                      </p>
                    </div>
                    <Badge variant={member.status === 'active' ? 'success' : 'warning'}>{member.status}</Badge>
                    <div className="flex items-center gap-2">
                      <Select
                        aria-label={`Role for ${member.profiles?.full_name ?? 'member'}`}
                        value={member.role}
                        disabled={!editable}
                        onChange={(event) => void changeRole(member, event.target.value as TenantRole)}
                        className="h-9 w-32"
                      >
                        {(Object.keys(ROLE_LABELS) as TenantRole[]).map((role) => (
                          <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                        ))}
                      </Select>
                      {editable ? (
                        <button
                          type="button"
                          aria-label="Remove member"
                          onClick={() => setMemberToRemove(member)}
                          className="rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState title="No team members" description="Invite your first teammate to collaborate." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>Invitation links expire after 7 days and are bound to the invited email.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {query.data?.invitations.length ? (
            <ul className="divide-y divide-ink-100">
              {query.data.invitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><MailPlus className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{invitation.email}</p>
                    <p className="text-xs text-ink-500">{ROLE_LABELS[invitation.role]} · Expires {formatDate(invitation.expires_at)}</p>
                  </div>
                  {can('manage_team') ? (
                    <Button variant="ghost" size="sm" onClick={() => void revokeInvitation(invitation)}>Revoke</Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No pending invitations" description="Invitations you create will appear here." />
          )}
        </CardContent>
      </Card>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a team member"
        description="They'll receive a secure link to join this business."
      >
        {latestLink ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Invitation created. Copy and share this link:
            </div>
            <div className="flex gap-2">
              <Input readOnly value={latestLink} aria-label="Invitation link" />
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(latestLink)
                  toast({ title: 'Link copied' })
                }}
              >
                <Copy className="size-4" /> Copy
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setInviteOpen(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={onInvite} className="space-y-4" noValidate>
            {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
            <div>
              <Label htmlFor="invite-email">Email address</Label>
              <Input id="invite-email" type="email" placeholder="teammate@business.com" {...inviteForm.register('email')} />
              <FieldError>{inviteForm.formState.errors.email?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" {...inviteForm.register('role')}>
                <option value="employee">Employee — works on assigned records</option>
                <option value="manager">Manager — leads a team</option>
                <option value="admin">Admin — manages settings and team</option>
              </Select>
              <FieldError>{inviteForm.formState.errors.role?.message}</FieldError>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" loading={inviteForm.formState.isSubmitting}>Create invitation</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(memberToRemove)}
        onClose={() => setMemberToRemove(null)}
        title="Remove team member?"
        description="They will lose access to this business immediately."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMemberToRemove(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => void removeMember()}>Remove member</Button>
        </div>
      </Modal>
    </div>
  )
}
