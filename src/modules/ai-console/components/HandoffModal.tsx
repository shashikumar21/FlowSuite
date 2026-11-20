import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { ConversationRow } from '@/types/database'
import { handoffConversation } from '../api'
import type { MemberOption } from '../api'
import { handoffSchema } from '../schemas'
import type { HandoffFormValues } from '../schemas'

export function HandoffModal({
  open,
  onClose,
  tenantId,
  conversation,
  members,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  conversation: ConversationRow | null
  members: MemberOption[]
  onSaved: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<HandoffFormValues>({
    resolver: zodResolver(handoffSchema),
    defaultValues: { to_user: '', reason: '', note: '' },
  })

  useEffect(() => {
    if (!open) return
    setError(null)
    form.reset({ to_user: members[0]?.user_id ?? '', reason: '', note: '' })
  }, [open, members, form])

  const submit = form.handleSubmit(async (values) => {
    if (!conversation) return
    setError(null)
    try {
      await handoffConversation(tenantId, conversation.id, values)
      onSaved()
      onClose()
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Hand conversation to a teammate"
      description={conversation ? `${conversation.customer_name ?? 'Customer'} · ${conversation.channel}` : undefined}
    >
      <form noValidate onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="handoff-user">Team member</Label>
          <Select id="handoff-user" {...form.register('to_user')}>
            <option value="">Choose a member</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.profiles?.full_name ?? member.user_id} ({member.role})
              </option>
            ))}
          </Select>
          <FieldError>{form.formState.errors.to_user?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="handoff-reason">Reason</Label>
          <Input id="handoff-reason" placeholder="Clinical question" {...form.register('reason')} />
          <FieldError>{form.formState.errors.reason?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="handoff-note">Internal note</Label>
          <Textarea id="handoff-note" {...form.register('note')} />
          <FieldError>{form.formState.errors.note?.message}</FieldError>
        </div>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Hand off</Button>
        </div>
      </form>
    </Modal>
  )
}
