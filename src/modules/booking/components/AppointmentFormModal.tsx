import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { BookingResourceRow, ServiceResourceRow, ServiceRow } from '@/types/database'
import { createStaffAppointment, fetchBookingContacts, fetchSlots } from '../api'
import { bookingKeys } from '../hooks'
import { appointmentSchema, type AppointmentFormValues } from '../schemas'
import {
  bookingDateOptions,
  createIdempotencyKey,
  formatLeadTime,
  linkedResourceIds,
  todayInZone,
} from '../utils'
import { FormError } from './FormError'
import { SlotPicker } from './SlotPicker'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  timeZone: string
  services: ServiceRow[]
  resources: BookingResourceRow[]
  serviceResources: ServiceResourceRow[]
  horizonDays?: number
  slotIntervalMinutes?: number
  leadTimeMinutes?: number
  onSaved: () => void
}

export function AppointmentFormModal({
  open,
  onClose,
  tenantId,
  timeZone,
  services,
  resources,
  serviceResources,
  horizonDays = 60,
  slotIntervalMinutes = 15,
  leadTimeMinutes = 60,
  onSaved,
}: Props) {
  const { toast } = useToast()
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      service_id: '',
      date: todayInZone(timeZone),
      resource_id: '',
      contact_id: '',
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      notes: '',
      start_at: '',
    },
  })

  const activeServices = services.filter((service) => service.active)
  const firstServiceId = activeServices[0]?.id ?? ''
  const serviceId = form.watch('service_id')
  const date = form.watch('date')
  const resourceId = form.watch('resource_id')
  const selectedStart = form.watch('start_at')
  const dates = bookingDateOptions(timeZone, horizonDays)

  const linked = linkedResourceIds(serviceResources, serviceId)
  const availableResources = linked.length > 0
    ? resources.filter((resource) => resource.active && linked.includes(resource.id))
    : resources.filter((resource) => resource.active)

  useEffect(() => {
    if (!open) return
    setIdempotencyKey(createIdempotencyKey())
    form.reset({
      service_id: '',
      date: todayInZone(timeZone),
      resource_id: '',
      contact_id: '',
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      notes: '',
      start_at: '',
    })
  }, [open, timeZone, form])

  useEffect(() => {
    if (!open || !firstServiceId || form.getValues('service_id')) return
    form.setValue('service_id', firstServiceId)
  }, [open, firstServiceId, form])

  useEffect(() => {
    form.setValue('start_at', '', { shouldValidate: false })
    form.clearErrors('start_at')
  }, [serviceId, date, resourceId, form])

  const slotsQuery = useQuery({
    queryKey: [...bookingKeys.slots(tenantId), 'staff', serviceId, date, resourceId],
    enabled: Boolean(open && tenantId && serviceId && date),
    queryFn: () =>
      fetchSlots(tenantId, serviceId, date, resourceId || null, {
        intervalMinutes: slotIntervalMinutes,
        leadTimeMinutes,
      }),
  })

  const contactsQuery = useQuery({
    queryKey: [...bookingKeys.all(tenantId), 'contacts'],
    enabled: Boolean(open && tenantId),
    queryFn: () => fetchBookingContacts(tenantId),
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await createStaffAppointment(tenantId, { ...values, idempotency_key: idempotencyKey })
      toast({ title: 'Appointment booked', description: 'The slot was validated and the end time was set by the server.' })
      onSaved()
      onClose()
    } catch (error) {
      const message = getErrorMessage(error)
      form.setError('root', { message })
      void slotsQuery.refetch()
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New appointment"
      description={`Times are shown in ${timeZone}. ${formatLeadTime(leadTimeMinutes)}; the server validates every slot.`}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={form.formState.errors.root?.message} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="appointment-service">Service</Label>
            <Select id="appointment-service" {...form.register('service_id')}>
              <option value="">Select a service</option>
              {activeServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
            </Select>
            <FieldError>{form.formState.errors.service_id?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="appointment-date">Date ({timeZone})</Label>
            <Select id="appointment-date" {...form.register('date')}>
              {dates.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <FieldError>{form.formState.errors.date?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="appointment-resource">Resource (optional)</Label>
            <Select id="appointment-resource" {...form.register('resource_id')}>
              <option value="">Auto-assign</option>
              {availableResources.map((resource) => (
                <option key={resource.id} value={resource.id}>{resource.name} ({resource.kind})</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="appointment-contact">Existing contact (optional)</Label>
            <Select id="appointment-contact" {...form.register('contact_id')}>
              <option value="">No contact linked</option>
              {(contactsQuery.data ?? []).map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.first_name}{contact.last_name ? ` ${contact.last_name}` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="appointment-customer">Customer name</Label>
            <Input id="appointment-customer" {...form.register('customer_name')} />
            <FieldError>{form.formState.errors.customer_name?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="appointment-phone">Phone</Label>
            <Input id="appointment-phone" type="tel" {...form.register('customer_phone')} />
          </div>
          <div>
            <Label htmlFor="appointment-email">Email</Label>
            <Input id="appointment-email" type="email" {...form.register('customer_email')} />
            <FieldError>{form.formState.errors.customer_email?.message}</FieldError>
          </div>
        </div>

        <div>
          <Label>Available times</Label>
          <input type="hidden" {...form.register('start_at')} />
          {slotsQuery.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(slotsQuery.error)}</p>
          ) : (
            <SlotPicker
              slots={slotsQuery.data ?? []}
              timeZone={timeZone}
              selectedStart={selectedStart}
              loading={slotsQuery.isLoading}
              onSelect={(slot) => {
                form.setValue('start_at', slot.start, { shouldValidate: true })
                form.clearErrors('start_at')
                form.clearErrors('root')
              }}
            />
          )}
          <FieldError>{form.formState.errors.start_at?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="appointment-notes">Notes</Label>
          <Textarea id="appointment-notes" {...form.register('notes')} />
          <FieldError>{form.formState.errors.notes?.message}</FieldError>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Book appointment</Button>
        </div>
      </form>
    </Modal>
  )
}
