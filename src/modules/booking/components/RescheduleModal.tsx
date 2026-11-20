import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { AppointmentRow } from '@/types/database'
import { fetchSlots, rescheduleAppointment } from '../api'
import { bookingKeys } from '../hooks'
import { rescheduleSchema, type RescheduleFormValues } from '../schemas'
import { bookingDateOptions, calendarDateInZone, todayInZone } from '../utils'
import { FormError } from './FormError'
import { SlotPicker } from './SlotPicker'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  appointment: AppointmentRow | null
  timeZone: string
  serviceName: string | null
  horizonDays?: number
  slotIntervalMinutes?: number
  leadTimeMinutes?: number
  onSaved: () => void
}

export function RescheduleModal({
  open,
  onClose,
  tenantId,
  appointment,
  timeZone,
  serviceName,
  horizonDays = 60,
  slotIntervalMinutes = 15,
  leadTimeMinutes = 60,
  onSaved,
}: Props) {
  const { toast } = useToast()
  const form = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: { date: todayInZone(timeZone), start_at: '', reason: '' },
  })
  const date = form.watch('date')
  const selectedStart = form.watch('start_at')
  const dates = bookingDateOptions(timeZone, horizonDays)
  const serviceId = appointment?.service_id ?? ''

  useEffect(() => {
    if (!open) return
    form.reset({
      date: appointment ? calendarDateInZone(appointment.start_at, timeZone) : todayInZone(timeZone),
      start_at: '',
      reason: '',
    })
  }, [open, appointment, timeZone, form])

  useEffect(() => {
    form.setValue('start_at', '', { shouldValidate: false })
    form.clearErrors('start_at')
  }, [date, form])

  const slotsQuery = useQuery({
    queryKey: [
      ...bookingKeys.slots(tenantId),
      'reschedule',
      appointment?.id ?? '',
      serviceId,
      date,
    ],
    enabled: Boolean(open && tenantId && appointment && serviceId && date),
    queryFn: () =>
      fetchSlots(tenantId, serviceId, date, appointment?.resource_id ?? null, {
        intervalMinutes: slotIntervalMinutes,
        leadTimeMinutes,
        excludeAppointment: appointment?.id ?? null,
      }),
  })

  const onSubmit = form.handleSubmit(async (values) => {
    if (!appointment) return
    try {
      await rescheduleAppointment(tenantId, appointment.id, values.start_at, values.reason || undefined)
      toast({ title: 'Appointment rescheduled' })
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
      title="Reschedule appointment"
      description={`${serviceName ?? 'Appointment'} · times shown in ${timeZone}.`}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={form.formState.errors.root?.message} />
        <div>
          <Label htmlFor="reschedule-date">New date ({timeZone})</Label>
          <Select id="reschedule-date" {...form.register('date')}>
            {dates.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
          <FieldError>{form.formState.errors.date?.message}</FieldError>
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
          <Label htmlFor="reschedule-reason">Reason (optional)</Label>
          <Textarea id="reschedule-reason" {...form.register('reason')} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Confirm new time</Button>
        </div>
      </form>
    </Modal>
  )
}
