import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { BookingResourceRow } from '@/types/database'
import { createException } from '../api'
import {
  availabilityExceptionSchema,
  exceptionTypes,
  type AvailabilityExceptionFormValues,
} from '../schemas'
import { dateTimeLocalToIso } from '../utils'
import { FormError } from './FormError'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  resources: BookingResourceRow[]
  onSaved: () => void
}

const emptyValues: AvailabilityExceptionFormValues = {
  resource_id: '',
  exception_type: 'blocked',
  title: '',
  start_at: '',
  end_at: '',
  all_day: false,
}

export function AvailabilityExceptionFormModal({ open, onClose, tenantId, resources, onSaved }: Props) {
  const { toast } = useToast()
  const form = useForm<AvailabilityExceptionFormValues>({
    resolver: zodResolver(availabilityExceptionSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (open) form.reset(emptyValues)
  }, [open, form])

  const onSubmit = form.handleSubmit(async (values) => {
    const startAt = dateTimeLocalToIso(values.start_at)
    const endAt = dateTimeLocalToIso(values.end_at)
    if (!startAt || !endAt) {
      form.setError('root', { message: 'Enter a valid start and end time.' })
      return
    }
    try {
      await createException(tenantId, { ...values, start_at: startAt, end_at: endAt })
      toast({ title: 'Exception added' })
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
      title="Add availability exception"
      description="Block time, open extra hours, or mark a break."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={form.formState.errors.root?.message} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="exception-type">Type</Label>
            <Select id="exception-type" {...form.register('exception_type')}>
              {exceptionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="exception-resource">Resource (optional)</Label>
            <Select id="exception-resource" {...form.register('resource_id')}>
              <option value="">All resources</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>{resource.name}</option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="exception-title">Title</Label>
            <Input id="exception-title" {...form.register('title')} />
          </div>
          <div>
            <Label htmlFor="exception-start">Start</Label>
            <Input id="exception-start" type="datetime-local" {...form.register('start_at')} />
            <FieldError>{form.formState.errors.start_at?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="exception-end">End</Label>
            <Input id="exception-end" type="datetime-local" {...form.register('end_at')} />
            <FieldError>{form.formState.errors.end_at?.message}</FieldError>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="size-4" {...form.register('all_day')} />
          All-day exception
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Add exception</Button>
        </div>
      </form>
    </Modal>
  )
}
