import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { BookingResourceRow } from '@/types/database'
import { createResource, updateResource, type MemberOption } from '../api'
import { resourceKinds, resourceSchema, type ResourceFormValues } from '../schemas'
import { FormError } from './FormError'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  resource: BookingResourceRow | null
  members: MemberOption[]
  onSaved: () => void
}

const emptyValues: ResourceFormValues = {
  name: '',
  kind: 'employee',
  member_user_id: '',
  notes: '',
  active: true,
}

export function ResourceFormModal({ open, onClose, tenantId, resource, members, onSaved }: Props) {
  const { toast } = useToast()
  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      resource
        ? {
            name: resource.name,
            kind: resource.kind,
            member_user_id: resource.member_user_id ?? '',
            notes: resource.notes ?? '',
            active: resource.active,
          }
        : emptyValues,
    )
  }, [open, resource, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (resource) {
        await updateResource(tenantId, resource.id, values)
        toast({ title: 'Resource updated' })
      } else {
        await createResource(tenantId, values)
        toast({ title: 'Resource created' })
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
      title={resource ? 'Edit resource' : 'New resource'}
      description="Employees must be active members of this business to be linked."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={form.formState.errors.root?.message} />
        <div>
          <Label htmlFor="resource-name">Name</Label>
          <Input id="resource-name" autoFocus {...form.register('name')} />
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="resource-kind">Kind</Label>
          <Select id="resource-kind" {...form.register('kind')}>
            {resourceKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </Select>
          <FieldError>{form.formState.errors.kind?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="resource-member">Linked team member (optional)</Label>
          <Select id="resource-member" {...form.register('member_user_id')}>
            <option value="">Not linked</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.full_name ?? member.user_id} ({member.role})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="resource-notes">Notes</Label>
          <Textarea id="resource-notes" {...form.register('notes')} />
          <FieldError>{form.formState.errors.notes?.message}</FieldError>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="size-4" {...form.register('active')} />
          Active and bookable
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>{resource ? 'Save changes' : 'Create resource'}</Button>
        </div>
      </form>
    </Modal>
  )
}
