import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { AiAgentRow } from '@/types/database'
import { saveAgent } from '../api'
import { agentStatusOptions, agentSchema, languageOptions, responseStyleOptions, toneOptions } from '../schemas'
import type { AgentFormInput, AgentFormValues } from '../schemas'
import type { MemberOption } from '../api'

const emptyValues: AgentFormInput = {
  name: '',
  language: 'en',
  tone: 'friendly',
  response_style: 'short',
  business_info: '',
  monthly_token_limit: '',
  booking_permission: false,
  handoff_user_id: '',
  status: 'draft',
}

export function AgentFormModal({
  open,
  onClose,
  tenantId,
  agent,
  members,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  agent: AiAgentRow | null
  members: MemberOption[]
  onSaved: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<AgentFormInput, unknown, AgentFormValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    setError(null)
    form.reset({
      name: agent?.name ?? '',
      language: agent?.language ?? 'en',
      tone: agent?.tone ?? 'friendly',
      response_style: agent?.response_style ?? 'short',
      business_info: agent?.business_info ?? '',
      monthly_token_limit: agent?.monthly_token_limit ? String(agent.monthly_token_limit) : '',
      booking_permission: agent?.booking_permission ?? false,
      handoff_user_id: agent?.handoff_user_id ?? '',
      status: agent?.status ?? 'draft',
    })
  }, [open, agent, form])

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      await saveAgent(tenantId, values, agent?.id)
      onSaved()
      onClose()
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={agent ? `Edit ${agent.name}` : 'New AI agent'}
      description="Configuration is written through a tenant-checked RPC. Provider keys are never stored here."
    >
      <form noValidate onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="agent-name">Agent name</Label>
          <Input id="agent-name" {...form.register('name')} placeholder="Front desk assistant" />
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="agent-language">Language</Label>
            <Select id="agent-language" {...form.register('language')}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <FieldError>{form.formState.errors.language?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="agent-tone">Tone</Label>
            <Select id="agent-tone" {...form.register('tone')}>
              {toneOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <FieldError>{form.formState.errors.tone?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="agent-style">Response style</Label>
            <Select id="agent-style" {...form.register('response_style')}>
              {responseStyleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="agent-status">Status</Label>
            <Select id="agent-status" {...form.register('status')}>
              {agentStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="agent-info">Business information for the agent</Label>
          <Textarea
            id="agent-info"
            {...form.register('business_info')}
            placeholder="Services, policies and tone guidance. Do not add medical advice."
          />
          <p className="mt-1 text-xs text-ink-500">The safety layer blocks diagnosis, medication and treatment advice.</p>
          <FieldError>{form.formState.errors.business_info?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="agent-limit">Monthly token limit (blank = no limit from the agent)</Label>
          <Input id="agent-limit" type="number" min="1" {...form.register('monthly_token_limit')} />
          <FieldError>{form.formState.errors.monthly_token_limit?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="agent-handoff">Escalation recipient</Label>
          <Select id="agent-handoff" {...form.register('handoff_user_id')}>
            <option value="">No default recipient</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.profiles?.full_name ?? member.user_id} ({member.role})
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" className="mt-0.5" {...form.register('booking_permission')} />
          Allow the agent to create bookings (only after the trusted booking RPC succeeds).
        </label>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Save agent</Button>
        </div>
      </form>
    </Modal>
  )
}
