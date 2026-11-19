import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { dealSchema, type DealFormInput, type DealFormValues } from '../schemas'
import { createDeal, convertLeadToDeal, type CrmOptions } from '../api'
import { stagesForPipeline } from '../utils'
import type { ContactSearchRow } from '@/types/database'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  options: CrmOptions
  contacts: ContactSearchRow[]
  currency: string
  currentUserId: string
  canAssign: boolean
  mode: 'create' | 'convert'
  convertContactId?: string
  initialPipelineId?: string
  initialStageId?: string
  onSaved: () => void
}

export function DealFormModal({
  open,
  onClose,
  tenantId,
  options,
  contacts,
  currency,
  currentUserId,
  canAssign,
  mode,
  convertContactId,
  initialPipelineId,
  initialStageId,
  onSaved,
}: Props) {
  const { toast } = useToast()
  const firstPipeline = options.pipelines[0]?.id ?? ''
  const pipelineId = initialPipelineId || firstPipeline
  const initialStages = stagesForPipeline(options.stages, pipelineId)
  const stageId = initialStageId || initialStages[0]?.id || ''

  const form = useForm<DealFormInput, unknown, DealFormValues>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      title: '',
      contact_id: convertContactId ?? '',
      pipeline_id: pipelineId,
      stage_id: stageId,
      value: '0',
      currency,
      assigned_to: canAssign ? '' : currentUserId,
      expected_close_date: '',
      description: '',
    },
  })

  const selectedPipeline = form.watch('pipeline_id')

  useEffect(() => {
    if (!open) return
    form.reset({
      title: mode === 'convert' ? 'New deal' : '',
      contact_id: convertContactId ?? '',
      pipeline_id: pipelineId,
      stage_id: stageId,
      value: '0',
      currency,
      assigned_to: canAssign ? '' : currentUserId,
      expected_close_date: '',
      description: '',
    })
  }, [open, mode, convertContactId, pipelineId, stageId, currency, currentUserId, canAssign, form])

  useEffect(() => {
    const stages = stagesForPipeline(options.stages, selectedPipeline)
    if (stages.length === 0) return
    if (!stages.some((stage) => stage.id === form.getValues('stage_id'))) {
      form.setValue('stage_id', stages[0]?.id ?? '', { shouldValidate: true })
    }
  }, [selectedPipeline, options.stages, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (mode === 'convert' && convertContactId) {
        await convertLeadToDeal(tenantId, convertContactId, values)
        toast({ title: 'Lead converted', description: 'The contact is now a customer with a linked deal.' })
      } else {
        await createDeal(tenantId, values)
        toast({ title: 'Deal created' })
      }
      onSaved()
      onClose()
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error) })
    }
  })

  const stages = stagesForPipeline(options.stages, selectedPipeline)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'convert' ? 'Convert lead to deal' : 'Create a deal'}
      description={mode === 'convert' ? 'The lead becomes a customer and keeps its full activity history.' : 'Deals are visible only to people who can access their contact.'}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formState.errors.root?.message ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {form.formState.errors.root.message}
          </p>
        ) : null}

        <div>
          <Label htmlFor="deal-title">Deal title</Label>
          <Input id="deal-title" autoFocus {...form.register('title')} />
          <FieldError>{form.formState.errors.title?.message}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {mode === 'create' ? (
            <div className="sm:col-span-2">
              <Label htmlFor="deal-contact">Contact</Label>
              <Select id="deal-contact" {...form.register('contact_id')}>
                <option value="">Select a contact</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.first_name} {contact.last_name ?? ''}
                    {contact.company ? ` — ${contact.company}` : ''}
                  </option>
                ))}
              </Select>
              <FieldError>{form.formState.errors.contact_id?.message}</FieldError>
            </div>
          ) : null}

          <div>
            <Label htmlFor="deal-pipeline">Pipeline</Label>
            <Select id="deal-pipeline" {...form.register('pipeline_id')}>
              {options.pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
              ))}
            </Select>
            <FieldError>{form.formState.errors.pipeline_id?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="deal-stage">Stage</Label>
            <Select id="deal-stage" {...form.register('stage_id')}>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </Select>
            <FieldError>{form.formState.errors.stage_id?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="deal-value">Value ({currency})</Label>
            <Input id="deal-value" type="number" min="0" step="1" inputMode="numeric" {...form.register('value')} />
            <FieldError>{form.formState.errors.value?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="deal-close">Expected close date</Label>
            <Input id="deal-close" type="date" {...form.register('expected_close_date')} />
          </div>
          <div>
            <Label htmlFor="deal-assigned">Assigned to</Label>
            <Select id="deal-assigned" disabled={!canAssign} {...form.register('assigned_to')}>
              <option value="">Unassigned</option>
              {options.members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name ?? member.user_id} ({member.role})
                </option>
              ))}
            </Select>
            {!canAssign ? <p className="mt-1 text-xs text-ink-500">New deals are assigned to you automatically.</p> : null}
          </div>
        </div>

        <div>
          <Label htmlFor="deal-description">Description</Label>
          <Textarea id="deal-description" {...form.register('description')} />
          <FieldError>{form.formState.errors.description?.message}</FieldError>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            {mode === 'convert' ? 'Convert lead' : 'Create deal'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
