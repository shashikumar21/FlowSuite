import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { contactSchema, contactStatuses, leadStatuses, type ContactFormValues } from '../schemas'
import { createContact, updateContact, type MemberOption } from '../api'
import type { ContactRow, LeadSourceRow } from '@/types/database'

function toDateTimeLocal(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  sources: LeadSourceRow[]
  members: MemberOption[]
  currentUserId: string
  canAssign: boolean
  contact: ContactRow | null
  onSaved: () => void
}

export function ContactFormModal({
  open,
  onClose,
  tenantId,
  sources,
  members,
  currentUserId,
  canAssign,
  contact,
  onSaved,
}: Props) {
  const { toast } = useToast()
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      company: '',
      source_id: '',
      notes: '',
      lead_status: 'new',
      status: 'lead',
      assigned_to: currentUserId,
      follow_up_at: '',
    },
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      contact
        ? {
            first_name: contact.first_name,
            last_name: contact.last_name ?? '',
            email: contact.email ?? '',
            phone: contact.phone ?? '',
            company: contact.company ?? '',
            source_id: contact.source_id ?? '',
            notes: contact.notes ?? '',
            lead_status: contact.lead_status,
            status: contact.status,
            assigned_to: contact.assigned_to ?? (canAssign ? '' : currentUserId),
            follow_up_at: toDateTimeLocal(contact.follow_up_at),
          }
        : {
            first_name: '',
            last_name: '',
            email: '',
            phone: '',
            company: '',
            source_id: '',
            notes: '',
            lead_status: 'new',
            status: 'lead',
            assigned_to: canAssign ? '' : currentUserId,
            follow_up_at: '',
          },
    )
  }, [open, contact, canAssign, currentUserId, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (contact) {
        await updateContact(tenantId, contact.id, values)
        toast({ title: 'Contact updated' })
      } else {
        await createContact(tenantId, values)
        toast({ title: 'Lead added', description: 'The contact and its first activity were saved.' })
      }
      onSaved()
      onClose()
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error) })
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={contact ? 'Edit contact' : 'Add a new lead'}
      description={contact ? 'Changes are written to this business only.' : 'New leads start in the “new” stage.'}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formState.errors.root?.message ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {form.formState.errors.root.message}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-first">First name</Label>
            <Input id="contact-first" autoFocus {...form.register('first_name')} />
            <FieldError>{form.formState.errors.first_name?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="contact-last">Last name</Label>
            <Input id="contact-last" {...form.register('last_name')} />
            <FieldError>{form.formState.errors.last_name?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" type="email" {...form.register('email')} />
            <FieldError>{form.formState.errors.email?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="contact-phone">Phone</Label>
            <Input id="contact-phone" type="tel" {...form.register('phone')} />
            <FieldError>{form.formState.errors.phone?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="contact-company">Company</Label>
            <Input id="contact-company" {...form.register('company')} />
          </div>
          <div>
            <Label htmlFor="contact-source">Lead source</Label>
            <Select id="contact-source" {...form.register('source_id')}>
              <option value="">Not specified</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="contact-lead-status">Lead status</Label>
            <Select id="contact-lead-status" {...form.register('lead_status')}>
              {leadStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="contact-status">Contact status</Label>
            <Select id="contact-status" {...form.register('status')}>
              {contactStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="contact-assigned">Assigned to</Label>
            <Select
              id="contact-assigned"
              disabled={!canAssign}
              {...form.register('assigned_to')}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name ?? member.user_id} ({member.role})
                </option>
              ))}
            </Select>
            {!canAssign ? <p className="mt-1 text-xs text-ink-500">Only managers can change assignments.</p> : null}
          </div>
          {contact ? (
            <div>
              <Label htmlFor="contact-follow-up">Next follow-up</Label>
              <Input id="contact-follow-up" type="datetime-local" {...form.register('follow_up_at')} />
            </div>
          ) : null}
        </div>

        <div>
          <Label htmlFor="contact-notes">Notes</Label>
          <Textarea id="contact-notes" placeholder="Enquiry details, preferences, follow-up context…" {...form.register('notes')} />
          <FieldError>{form.formState.errors.notes?.message}</FieldError>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>{contact ? 'Save changes' : 'Add lead'}</Button>
        </div>
      </form>
    </Modal>
  )
}
