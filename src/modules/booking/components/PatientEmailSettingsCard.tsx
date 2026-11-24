import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import type { PatientEmailStatus } from '@/types/database'
import { FormError } from './FormError'
import {
  fetchPatientEmailOverview,
  maskEmail,
  patientEmailKindLabels,
  patientEmailSettingsSchema,
  patientEmailStatusLabels,
  settingsToValues,
  updatePatientEmailSettings,
  type PatientEmailSettingsInput,
  type PatientEmailSettingsValues,
} from '../patientEmails'

const statusVariant: Record<PatientEmailStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  pending: 'brand',
  sending: 'brand',
  sent: 'success',
  failed: 'danger',
  skipped: 'neutral',
  cancelled: 'neutral',
}

function formatInZone(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone,
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString('en-IN')
  }
}

export function PatientEmailSettingsCard({
  tenantId,
  canManage,
  timezone,
}: {
  tenantId: string
  canManage: boolean
  timezone: string
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const queryKey = ['booking', tenantId, 'patient-emails'] as const
  const query = useQuery({ queryKey, queryFn: () => fetchPatientEmailOverview(tenantId) })

  const form = useForm<PatientEmailSettingsInput, unknown, PatientEmailSettingsValues>({
    resolver: zodResolver(patientEmailSettingsSchema),
    defaultValues: settingsToValues(null),
  })

  useEffect(() => {
    if (query.data) form.reset(settingsToValues(query.data.settings))
  }, [query.data, form])

  const remindersOn = form.watch('reminders_enabled')

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updatePatientEmailSettings(tenantId, values)
      toast({ title: 'Patient emails updated', description: 'New bookings will follow these settings.' })
      void queryClient.invalidateQueries({ queryKey })
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error) })
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="size-4" /> Patient emails</CardTitle>
        <CardDescription>
          Automatic emails to patients who give an email address. Everything is off until you switch it on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {query.isLoading ? (
          <div className="space-y-3"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
        ) : query.isError ? (
          <ErrorState message="We couldn't load patient email settings." onRetry={() => { void query.refetch() }} />
        ) : (
          <>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <FormError message={form.formState.errors.root?.message} />
              <fieldset disabled={!canManage} className="space-y-3">
                <label className="flex items-start gap-2 text-sm text-ink-700">
                  <input type="checkbox" className="mt-0.5 size-4" {...form.register('confirmations_enabled')} />
                  <span>Send a confirmation when a visit is booked, moved or cancelled</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-ink-700">
                  <input type="checkbox" className="mt-0.5 size-4" {...form.register('reminders_enabled')} />
                  <span>Send a reminder before each visit</span>
                </label>
                {remindersOn ? (
                  <div className="pl-6">
                    <Label htmlFor="reminder-hours">Hours before the visit</Label>
                    <Input id="reminder-hours" type="number" min={1} max={72} className="w-28" {...form.register('reminder_hours_before')} />
                    <FieldError>{form.formState.errors.reminder_hours_before?.message}</FieldError>
                  </div>
                ) : null}
                <label className="flex items-start gap-2 text-sm text-ink-700">
                  <input type="checkbox" className="mt-0.5 size-4" {...form.register('review_emails_auto_approve')} />
                  <span>
                    Send email review requests automatically after a completed visit
                    <span className="block text-xs text-ink-500">
                      Needs an active “appointment completed” workflow with the email channel. When off, each request waits for approval in Workflows.
                    </span>
                  </span>
                </label>
                <div>
                  <Label htmlFor="reply-to">Reply-to email (optional)</Label>
                  <Input id="reply-to" type="email" placeholder="frontdesk@yourclinic.in" {...form.register('reply_to_email')} />
                  <FieldError>{form.formState.errors.reply_to_email?.message}</FieldError>
                  <p className="mt-1 text-xs text-ink-500">Patient replies go here. Defaults to the business email.</p>
                </div>
              </fieldset>
              {canManage ? (
                <div className="flex justify-end">
                  <Button type="submit" size="sm" loading={form.formState.isSubmitting}>Save email settings</Button>
                </div>
              ) : null}
            </form>

            <div className="space-y-2 border-t border-ink-100 pt-4">
              <p className="text-sm font-medium text-ink-700">Recent patient emails</p>
              {query.data && query.data.recent.length > 0 ? (
                <ul className="space-y-2">
                  {query.data.recent.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-800">{patientEmailKindLabels[row.kind]}</p>
                        <p className="truncate text-xs text-ink-500">
                          {maskEmail(row.to_email)} · {formatInZone(row.sent_at ?? row.send_after, timezone)}
                        </p>
                      </div>
                      <Badge variant={statusVariant[row.status]} title={row.last_error ?? undefined}>
                        {patientEmailStatusLabels[row.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-500">No patient emails yet. They appear here once a booking is made with emails switched on.</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
