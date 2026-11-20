import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { ChannelRow, ContactRow } from '@/types/database'
import { createInboxConversation, type InboxMemberOption } from '../api'
import { useInboxInvalidate } from '../hooks'
import { newConversationSchema, type NewConversationFormValues } from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  channels: ChannelRow[]
  contacts: ContactRow[]
  members: InboxMemberOption[]
  currentUserId: string
  onCreated: (conversationId: string) => void
}

function contactLabel(contact: ContactRow): string {
  return `${contact.first_name} ${contact.last_name ?? ''}`.trim()
}

export function NewConversationModal({
  open,
  onClose,
  tenantId,
  channels,
  contacts,
  members,
  currentUserId,
  onCreated,
}: Props) {
  const { toast } = useToast()
  const invalidate = useInboxInvalidate(tenantId)
  const form = useForm<NewConversationFormValues>({
    resolver: zodResolver(newConversationSchema),
    defaultValues: {
      contact_id: '',
      channel_id: '',
      subject: '',
      customer_name: '',
      customer_email: '',
      assigned_to: currentUserId,
    },
  })
  const contactId = useWatch({ control: form.control, name: 'contact_id' })

  useEffect(() => {
    if (!open) return
    form.reset({
      contact_id: '',
      channel_id: '',
      subject: '',
      customer_name: '',
      customer_email: '',
      assigned_to: currentUserId,
    })
  }, [open, currentUserId, form])

  useEffect(() => {
    if (!open || !contactId) return
    const contact = contacts.find((item) => item.id === contactId)
    if (!contact) return
    if (!form.getValues('customer_name')) form.setValue('customer_name', contactLabel(contact))
    if (!form.getValues('customer_email') && contact.email) form.setValue('customer_email', contact.email)
  }, [open, contactId, contacts, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const conversationId = await createInboxConversation(tenantId, values)
      toast({ title: 'Conversation created' })
      invalidate()
      onCreated(conversationId)
      onClose()
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error) })
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New conversation"
      description="A blank channel is set to your workspace's internal channel."
      className="max-w-xl"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formState.errors.root?.message ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {form.formState.errors.root.message}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="new-conversation-contact">Existing contact (optional)</Label>
            <Select id="new-conversation-contact" autoFocus {...form.register('contact_id')}>
              <option value="">None</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>{contactLabel(contact)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="new-conversation-channel">Channel (optional)</Label>
            <Select id="new-conversation-channel" {...form.register('channel_id')}>
              <option value="">Internal (default)</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>{channel.name} ({channel.channel_type})</option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="new-conversation-subject">Subject</Label>
            <Input id="new-conversation-subject" placeholder="What is this conversation about?" {...form.register('subject')} />
            <FieldError>{form.formState.errors.subject?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="new-conversation-name">Customer name</Label>
            <Input id="new-conversation-name" {...form.register('customer_name')} />
            <FieldError>{form.formState.errors.customer_name?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="new-conversation-email">Customer email</Label>
            <Input id="new-conversation-email" type="email" {...form.register('customer_email')} />
            <FieldError>{form.formState.errors.customer_email?.message}</FieldError>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="new-conversation-assignee">Assign to (optional)</Label>
            <Select id="new-conversation-assignee" {...form.register('assigned_to')}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name ?? member.user_id} ({member.role})
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Create conversation</Button>
        </div>
      </form>
    </Modal>
  )
}
