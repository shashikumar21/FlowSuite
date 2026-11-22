import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { ProspectRow } from '@/types/database'
import {
  createProspect,
  findDuplicateProspect,
  updateProspect,
  type SalesMemberOption,
} from '../api'
import {
  emptyProspectForm,
  prospectSchema,
  type ProspectFormValues,
} from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  currentUserId: string
  members: SalesMemberOption[]
  prospect: ProspectRow | null
  onSaved: () => void
}

export function ProspectFormModal({
  open,
  onClose,
  tenantId,
  currentUserId,
  members,
  prospect,
  onSaved,
}: Props) {
  const { toast } = useToast()
  const form = useForm<ProspectFormValues>({
    resolver: zodResolver(prospectSchema),
    defaultValues: emptyProspectForm(),
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      prospect
        ? {
            business_name: prospect.business_name,
            industry: prospect.industry ?? '',
            city: prospect.city ?? '',
            state: prospect.state ?? '',
            country: prospect.country ?? '',
            website: prospect.website ?? '',
            business_size: prospect.business_size ?? '',
            contact_person: prospect.contact_person ?? '',
            email: prospect.email ?? '',
            phone: prospect.phone ?? '',
            source: prospect.source,
            assigned_to: prospect.assigned_to ?? '',
            notes: prospect.notes ?? '',
          }
        : emptyProspectForm(),
    )
    // New prospects default to the signed-in member; the RPC re-checks that
    // the assignee is an active member of this tenant.
    if (!prospect) form.setValue('assigned_to', currentUserId)
  }, [open, prospect, currentUserId, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (!prospect) {
        const duplicate = await findDuplicateProspect(tenantId, values)
        if (duplicate) {
          form.setError('root', {
            message:
              'A prospect with this business name and location, email or website already exists in this business.',
          })
          return
        }
        await createProspect(tenantId, values)
        toast({ title: 'Prospect added', description: 'Verification and outreach remain manual in this phase.' })
      } else {
        await updateProspect(tenantId, prospect.id, values)
        toast({ title: 'Prospect updated' })
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
      title={prospect ? 'Edit prospect' : 'Add a prospect'}
      description="Saved in this business only. No external lookup or email is sent."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formState.errors.root?.message ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {form.formState.errors.root.message}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="sales-prospect-name">Business name</Label>
            <Input id="sales-prospect-name" autoFocus {...form.register('business_name')} />
            <FieldError>{form.formState.errors.business_name?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="sales-prospect-industry">Industry</Label>
            <Input id="sales-prospect-industry" placeholder="Dental clinic" {...form.register('industry')} />
          </div>
          <div>
            <Label htmlFor="sales-prospect-size">Business size</Label>
            <Input id="sales-prospect-size" placeholder="1–10" {...form.register('business_size')} />
          </div>
          <div>
            <Label htmlFor="sales-prospect-contact">Contact person</Label>
            <Input id="sales-prospect-contact" {...form.register('contact_person')} />
          </div>
          <div>
            <Label htmlFor="sales-prospect-email">Email</Label>
            <Input id="sales-prospect-email" type="email" {...form.register('email')} />
            <FieldError>{form.formState.errors.email?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="sales-prospect-phone">Phone</Label>
            <Input id="sales-prospect-phone" type="tel" {...form.register('phone')} />
          </div>
          <div>
            <Label htmlFor="sales-prospect-website">Website</Label>
            <Input id="sales-prospect-website" placeholder="example.com" {...form.register('website')} />
          </div>
          <div>
            <Label htmlFor="sales-prospect-city">City</Label>
            <Input id="sales-prospect-city" {...form.register('city')} />
          </div>
          <div>
            <Label htmlFor="sales-prospect-state">State</Label>
            <Input id="sales-prospect-state" {...form.register('state')} />
          </div>
          <div>
            <Label htmlFor="sales-prospect-country">Country</Label>
            <Input id="sales-prospect-country" {...form.register('country')} />
          </div>
          <div>
            <Label htmlFor="sales-prospect-source">Source</Label>
            <Input id="sales-prospect-source" {...form.register('source')} />
            <FieldError>{form.formState.errors.source?.message}</FieldError>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="sales-prospect-assigned">Assigned to</Label>
            <Select id="sales-prospect-assigned" {...form.register('assigned_to')}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.profiles?.full_name ?? member.user_id} ({member.role})
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="sales-prospect-notes">Notes</Label>
            <Textarea id="sales-prospect-notes" placeholder="Why this prospect is relevant…" {...form.register('notes')} />
            <FieldError>{form.formState.errors.notes?.message}</FieldError>
          </div>
        </div>

        <p className="rounded-lg bg-ink-50 p-3 text-xs leading-5 text-ink-600">
          Verification is recorded separately. A syntactically valid email stays “Unverified” until it is explicitly
          attested or checked by a configured provider.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            {prospect ? 'Save changes' : 'Add prospect'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
