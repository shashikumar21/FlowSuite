import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HeartPulse, LockKeyhole, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Input, Label, Textarea } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { addMedicalHistory, fetchMedicalHistory } from '../api'
import {
  medicalHistoryFormSchema,
  type MedicalHistoryFormValues,
} from '../medicalHistorySchemas'
import type { CrmOptions } from '../api'

type Props = {
  tenantId: string
  contactId: string
  options: CrmOptions
  onChanged: () => void
}

const FIELDS: Array<{
  key: keyof Omit<MedicalHistoryFormValues, 'consent_given'>
  label: string
  placeholder: string
  textarea?: boolean
}> = [
  { key: 'allergies', label: 'Allergies', placeholder: 'Medicines, foods, materials or anaesthesia reactions' },
  { key: 'conditions', label: 'Existing conditions', placeholder: 'Diabetes, hypertension, heart conditions, pregnancy, etc.' },
  { key: 'medications', label: 'Current medications', placeholder: 'Medicine name and dose if the patient shared it' },
  { key: 'past_treatments', label: 'Past dental treatments', placeholder: 'Root canal, extraction, implants, orthodontics', textarea: true },
  { key: 'family_history', label: 'Relevant family history', placeholder: 'Only what the patient has consented to record' },
  { key: 'notes', label: 'Clinical notes', placeholder: 'Anything clinically relevant for the next visit', textarea: true },
]

/** Sensitive health data. Read/write happens only through trusted RPCs. */
export function MedicalHistoryPanel({ tenantId, contactId, options, onChanged }: Props) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const queryKey = ['crm', tenantId, 'contact', contactId, 'medical-history'] as const

  const historyQuery = useQuery({
    queryKey,
    queryFn: () => fetchMedicalHistory(tenantId, contactId),
  })

  const form = useForm<MedicalHistoryFormValues>({
    resolver: zodResolver(medicalHistoryFormSchema),
    defaultValues: {
      allergies: '',
      conditions: '',
      medications: '',
      past_treatments: '',
      family_history: '',
      notes: '',
      consent_given: false,
    },
  })

  const addMutation = useMutation({
    mutationFn: (values: MedicalHistoryFormValues) => addMedicalHistory(tenantId, contactId, values),
    onSuccess: async () => {
      setFormError(null)
      form.reset({
        allergies: '', conditions: '', medications: '', past_treatments: '',
        family_history: '', notes: '', consent_given: false,
      })
      await queryClient.invalidateQueries({ queryKey })
      onChanged()
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  })

  const onSubmit = form.handleSubmit((values) => addMutation.mutate(values))

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" />
        <p>
          Sensitive patient information. Only owners, admins and doctors can see this. It is never used in AI chat,
          marketing messages or public booking pages. Record only what the patient has agreed to share.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-ink-200 p-4">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-brand-600" />
          <h3 className="font-semibold text-ink-900">Add a dated entry</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.key} className={field.textarea ? 'sm:col-span-2' : undefined}>
              <Label htmlFor={`medical-${field.key}`}>{field.label}</Label>
              {field.textarea ? (
                <Textarea
                  id={`medical-${field.key}`}
                  rows={3}
                  placeholder={field.placeholder}
                  {...form.register(field.key)}
                />
              ) : (
                <Input id={`medical-${field.key}`} placeholder={field.placeholder} {...form.register(field.key)} />
              )}
              <FieldError>{form.formState.errors[field.key]?.message}</FieldError>
            </div>
          ))}
        </div>
        <label className="flex items-start gap-2 rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-brand-600"
            {...form.register('consent_given')}
          />
          <span>
            I confirm this patient consented to their medical information being recorded in FlowSuite for their care.
          </span>
        </label>
        <FieldError>{form.formState.errors.consent_given?.message}</FieldError>
        {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={addMutation.isPending}>Save medical history</Button>
        </div>
      </form>

      <div>
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-ink-900">
          <HeartPulse className="size-4 text-brand-600" /> History timeline
        </h3>
        {historyQuery.isLoading ? (
          <div className="space-y-2">{[0, 1].map((index) => <Skeleton key={index} className="h-16" />)}</div>
        ) : historyQuery.isError ? (
          <ErrorState message={getErrorMessage(historyQuery.error)} onRetry={() => void historyQuery.refetch()} />
        ) : !historyQuery.data?.length ? (
          <EmptyState
            icon={<HeartPulse className="size-5" />}
            title="No medical history recorded"
            description="The first consented entry will appear here as a dated timeline item."
          />
        ) : (
          <ol className="space-y-3">
            {historyQuery.data.map((entry) => {
              const recorder = options.members.find((member) => member.user_id === entry.recorded_by)
              const recordedBy = recorder?.full_name || 'A care team member'
              return (
                <li key={entry.id} className="rounded-lg border border-ink-200 p-4">
                  <p className="text-xs text-ink-500">
                    {formatDateTime(entry.recorded_at)} · recorded by {recordedBy} · consent {entry.consent_version}
                  </p>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    {([
                      ['Allergies', entry.allergies],
                      ['Conditions', entry.conditions],
                      ['Medications', entry.medications],
                      ['Past treatments', entry.past_treatments],
                      ['Family history', entry.family_history],
                      ['Notes', entry.notes],
                    ] as const).filter(([, value]) => value).map(([label, value]) => (
                      <div key={label}>
                        <dt className="font-medium text-ink-700">{label}</dt>
                        <dd className="whitespace-pre-wrap text-ink-600">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
