import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { AvailabilityRuleRow, BookingResourceRow } from '@/types/database'
import { deleteAvailabilityRule, upsertAvailabilityRule } from '../api'
import {
  availabilityRuleSchema,
  weekDays,
  type AvailabilityRuleFormInput,
  type AvailabilityRuleFormValues,
} from '../schemas'
import { FormError } from './FormError'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  rule: AvailabilityRuleRow | null
  resources: BookingResourceRow[]
  onSaved: () => void
}

const emptyValues: AvailabilityRuleFormInput = {
  resource_id: '',
  day_of_week: '1',
  start_time: '09:00',
  end_time: '17:00',
  is_active: true,
  valid_from: '',
  valid_until: '',
}

export function AvailabilityRuleFormModal({ open, onClose, tenantId, rule, resources, onSaved }: Props) {
  const { toast } = useToast()
  const form = useForm<AvailabilityRuleFormInput, unknown, AvailabilityRuleFormValues>({
    resolver: zodResolver(availabilityRuleSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      rule
        ? {
            resource_id: rule.resource_id ?? '',
            day_of_week: String(rule.day_of_week),
            start_time: rule.start_time.slice(0, 5),
            end_time: rule.end_time.slice(0, 5),
            is_active: rule.is_active,
            valid_from: rule.valid_from ?? '',
            valid_until: rule.valid_until ?? '',
          }
        : emptyValues,
    )
  }, [open, rule, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await upsertAvailabilityRule(tenantId, values, rule?.id ?? null)
      toast({ title: rule ? 'Availability rule updated' : 'Availability rule added' })
      onSaved()
      onClose()
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error) })
    }
  })

  const handleDelete = async () => {
    if (!rule) return
    try {
      await deleteAvailabilityRule(tenantId, rule.id)
      toast({ title: 'Availability rule removed' })
      onSaved()
      onClose()
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error) })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rule ? 'Edit availability rule' : 'Weekly availability'}
      description="Weekdays follow the business timezone (0 = Sunday)."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={form.formState.errors.root?.message} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rule-day">Day of week</Label>
            <Select id="rule-day" {...form.register('day_of_week')}>
              {weekDays.map((day) => (
                <option key={day.value} value={day.value}>{day.label}</option>
              ))}
            </Select>
            <FieldError>{form.formState.errors.day_of_week?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="rule-resource">Resource (optional)</Label>
            <Select id="rule-resource" {...form.register('resource_id')}>
              <option value="">All resources</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>{resource.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="rule-start">Start time</Label>
            <Input id="rule-start" type="time" {...form.register('start_time')} />
            <FieldError>{form.formState.errors.start_time?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="rule-end">End time</Label>
            <Input id="rule-end" type="time" {...form.register('end_time')} />
            <FieldError>{form.formState.errors.end_time?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="rule-from">Valid from (optional)</Label>
            <Input id="rule-from" type="date" {...form.register('valid_from')} />
          </div>
          <div>
            <Label htmlFor="rule-until">Valid until (optional)</Label>
            <Input id="rule-until" type="date" {...form.register('valid_until')} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="size-4" {...form.register('is_active')} />
          Rule is active
        </label>
        <div className="flex justify-between gap-2 pt-2">
          {rule ? (
            <Button type="button" variant="danger" loading={form.formState.isSubmitting} onClick={() => { void handleDelete() }}>
              Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Save rule</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
