import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { BookingResourceRow, ServiceRow } from '@/types/database'
import { createService, setServiceResources, updateService } from '../api'
import { serviceSchema, type ServiceFormInput, type ServiceFormValues } from '../schemas'
import { FormError } from './FormError'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  service: ServiceRow | null
  resources: BookingResourceRow[]
  linkedResourceIds: string[]
  onSaved: () => void
}

const emptyValues: ServiceFormInput = {
  name: '',
  description: '',
  duration_minutes: '30',
  price: '0',
  currency: 'INR',
  buffer_before_minutes: '0',
  buffer_after_minutes: '0',
  active: true,
  resource_ids: [],
}

export function ServiceFormModal({
  open,
  onClose,
  tenantId,
  service,
  resources,
  linkedResourceIds,
  onSaved,
}: Props) {
  const { toast } = useToast()
  const form = useForm<ServiceFormInput, unknown, ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      service
        ? {
            name: service.name,
            description: service.description ?? '',
            duration_minutes: String(service.duration_minutes),
            price: String(service.price),
            currency: service.currency,
            buffer_before_minutes: String(service.buffer_before_minutes),
            buffer_after_minutes: String(service.buffer_after_minutes),
            active: service.active,
            resource_ids: linkedResourceIds,
          }
        : { ...emptyValues, resource_ids: [] },
    )
  }, [open, service, linkedResourceIds, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      let serviceId = service?.id ?? null
      if (service) {
        await updateService(tenantId, service.id, values)
      } else {
        serviceId = await createService(tenantId, values)
      }
      if (serviceId) await setServiceResources(tenantId, serviceId, values.resource_ids)
      toast({ title: service ? 'Service updated' : 'Service created' })
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
      title={service ? 'Edit service' : 'New service'}
      description="Duration, price and buffers are validated by the server."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={form.formState.errors.root?.message} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="service-name">Name</Label>
            <Input id="service-name" autoFocus {...form.register('name')} />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="service-duration">Duration (minutes)</Label>
            <Input id="service-duration" type="number" min={1} max={480} {...form.register('duration_minutes')} />
            <FieldError>{form.formState.errors.duration_minutes?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="service-price">Price</Label>
            <Input id="service-price" type="number" min={0} step="0.01" {...form.register('price')} />
            <FieldError>{form.formState.errors.price?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="service-currency">Currency</Label>
            <Input id="service-currency" maxLength={3} {...form.register('currency')} />
            <FieldError>{form.formState.errors.currency?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="service-buffer-before">Buffer before (minutes)</Label>
            <Input id="service-buffer-before" type="number" min={0} max={240} {...form.register('buffer_before_minutes')} />
            <FieldError>{form.formState.errors.buffer_before_minutes?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="service-buffer-after">Buffer after (minutes)</Label>
            <Input id="service-buffer-after" type="number" min={0} max={240} {...form.register('buffer_after_minutes')} />
            <FieldError>{form.formState.errors.buffer_after_minutes?.message}</FieldError>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink-700">
            <input type="checkbox" className="size-4" {...form.register('active')} />
            Available for booking
          </label>
        </div>

        <div>
          <Label htmlFor="service-description">Description</Label>
          <Textarea id="service-description" {...form.register('description')} />
          <FieldError>{form.formState.errors.description?.message}</FieldError>
        </div>

        <fieldset className="rounded-lg border border-ink-200 p-3">
          <legend className="px-1 text-sm font-medium text-ink-700">Resources for this service</legend>
          {resources.length === 0 ? (
            <p className="text-sm text-ink-500">No resources yet. Any active resource can serve this service.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {resources.map((resource) => (
                <label key={resource.id} className="flex items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" className="size-4" value={resource.id} {...form.register('resource_ids')} />
                  {resource.name}
                  <span className="text-xs text-ink-400">({resource.kind})</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>{service ? 'Save changes' : 'Create service'}</Button>
        </div>
      </form>
    </Modal>
  )
}
