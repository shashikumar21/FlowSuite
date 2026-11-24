import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { contactStatuses, leadStatuses, makeContactSchema, type ContactFormValues } from '../schemas'
import { createContact, updateContact, type MemberOption } from '../api'
import type { ContactRow, LeadSourceRow } from '@/types/database'

function toDateTimeLocal(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function Required() {
  return <span className="ml-0.5 text-red-500">*</span>
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
  /** Clinics track patients/enquiries and need different required fields. */
  isClinic?: boolean
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
  isClinic = false,
}: Props) {
  const { toast } = useToast()
  const schema = useMemo(() => makeContactSchema({ isClinic }), [isClinic])
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(schema),
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
      clinic: '',
      area: '',
      mobile: '',
      rating: '',
      reviews: '',
      why_included: '',
      google_maps_url: '',
      sent: false,
      reply_1: '',
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
            clinic: contact.clinic ?? '',
            area: contact.area ?? '',
            mobile: contact.mobile ?? '',
            rating: contact.rating == null ? '' : String(contact.rating),
            reviews: contact.reviews == null ? '' : String(contact.reviews),
            why_included: contact.why_included ?? '',
            google_maps_url: contact.google_maps_url ?? '',
            sent: contact.sent,
            reply_1: contact.reply_1 ?? '',
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
            clinic: '',
            area: '',
            mobile: '',
            rating: '',
            reviews: '',
            why_included: '',
            google_maps_url: '',
            sent: false,
            reply_1: '',
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
            <Label htmlFor="contact-first">First name<Required /></Label>
            <Input id="contact-first" autoFocus {...form.register('first_name')} />
            <FieldError>{form.formState.errors.first_name?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="contact-last">Last name</Label>
            <Input id="contact-last" {...form.register('last_name')} />
            <FieldError>{form.formState.errors.last_name?.message}</FieldError>
          </div>
          {isClinic ? (
            <>
              {/* Keep the existing value on edit even though Company is hidden. */}
              <input type="hidden" {...form.register('company')} />
              <div>
                <Label htmlFor="contact-mobile">Mobile (+91)<Required /></Label>
                <Input id="contact-mobile" type="tel" placeholder="+919876543210" {...form.register('mobile')} />
                <FieldError>{form.formState.errors.mobile?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="contact-email">Email</Label>
                <Input id="contact-email" type="email" {...form.register('email')} />
                <FieldError>{form.formState.errors.email?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="contact-clinic">Clinic</Label>
                <Input id="contact-clinic" placeholder="Clinic name" {...form.register('clinic')} />
                <FieldError>{form.formState.errors.clinic?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="contact-area">Area<Required /></Label>
                <Input id="contact-area" placeholder="Locality or area" {...form.register('area')} />
                <FieldError>{form.formState.errors.area?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="contact-phone">Phone</Label>
                <Input id="contact-phone" type="tel" {...form.register('phone')} />
                <FieldError>{form.formState.errors.phone?.message}</FieldError>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="contact-email">Email</Label>
                <Input id="contact-email" type="email" {...form.register('email')} />
                <FieldError>{form.formState.errors.email?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="contact-phone">Phone</Label>
                <Input id="contact-phone" type="tel" {...form.register('phone')} />
                <FieldError>{form.formState.errors.phone?.message}</FieldError>
                <p className="mt-1 text-xs text-ink-500">At least one of email or phone is required.</p>
              </div>
              <div>
                <Label htmlFor="contact-company">Company<Required /></Label>
                <Input id="contact-company" {...form.register('company')} />
                <FieldError>{form.formState.errors.company?.message}</FieldError>
              </div>
            </>
          )}
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

        <div className="space-y-3 rounded-lg border border-ink-200 p-4">
          <h4 className="text-sm font-semibold text-ink-900">{isClinic ? 'Patient details' : 'Lead enrichment'}</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {!isClinic ? (
              <>
                <div>
                  <Label htmlFor="contact-clinic">Clinic</Label>
                  <Input id="contact-clinic" placeholder="Clinic name" {...form.register('clinic')} />
                  <FieldError>{form.formState.errors.clinic?.message}</FieldError>
                </div>
                <div>
                  <Label htmlFor="contact-area">Area</Label>
                  <Input id="contact-area" placeholder="Locality or area" {...form.register('area')} />
                  <FieldError>{form.formState.errors.area?.message}</FieldError>
                </div>
                <div>
                  <Label htmlFor="contact-mobile">Mobile (+91)</Label>
                  <Input id="contact-mobile" type="tel" placeholder="+919876543210" {...form.register('mobile')} />
                  <FieldError>{form.formState.errors.mobile?.message}</FieldError>
                </div>
              </>
            ) : null}
            <div>
              <Label htmlFor="contact-rating">Rating (0–5)</Label>
              <Input id="contact-rating" type="number" step="0.1" min="0" max="5" placeholder="4.5" {...form.register('rating')} />
              <FieldError>{form.formState.errors.rating?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="contact-reviews">Reviews</Label>
              <Input id="contact-reviews" type="number" step="1" min="0" placeholder="128" {...form.register('reviews')} />
              <FieldError>{form.formState.errors.reviews?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="contact-sent">Sent?</Label>
              <div className="flex h-10 items-center gap-2">
                <Input id="contact-sent" type="checkbox" className="size-4 cursor-pointer" {...form.register('sent')} />
                <span className="text-sm text-ink-600">Mark when the first reply was sent</span>
              </div>
              <FieldError>{form.formState.errors.sent?.message}</FieldError>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="contact-why-included">Why included</Label>
              <Textarea id="contact-why-included" placeholder="Reason this lead was added…" {...form.register('why_included')} />
              <FieldError>{form.formState.errors.why_included?.message}</FieldError>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="contact-google-maps">Google Maps link</Label>
              <Input id="contact-google-maps" type="url" placeholder="https://maps.google.com/…" {...form.register('google_maps_url')} />
              <FieldError>{form.formState.errors.google_maps_url?.message}</FieldError>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="contact-reply-1">Reply 1</Label>
              <Textarea id="contact-reply-1" placeholder="First reply sent to this lead…" {...form.register('reply_1')} />
              <FieldError>{form.formState.errors.reply_1?.message}</FieldError>
            </div>
          </div>
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
