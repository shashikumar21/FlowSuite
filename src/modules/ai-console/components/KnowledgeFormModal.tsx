import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { AiAgentRow, AiKnowledgeRow } from '@/types/database'
import { saveKnowledge } from '../api'
import { knowledgeCategoryOptions, knowledgeSchema, languageOptions } from '../schemas'
import type { KnowledgeFormValues } from '../schemas'

export function KnowledgeFormModal({
  open,
  onClose,
  tenantId,
  agents,
  entry,
  defaultAgentId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  agents: AiAgentRow[]
  entry: AiKnowledgeRow | null
  defaultAgentId?: string
  onSaved: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<KnowledgeFormValues>({
    resolver: zodResolver(knowledgeSchema),
    defaultValues: {
      agent_id: defaultAgentId ?? '',
      category: 'faq',
      title: '',
      content: '',
      language: 'en',
      active: true,
    },
  })

  useEffect(() => {
    if (!open) return
    setError(null)
    form.reset({
      agent_id: entry?.agent_id ?? defaultAgentId ?? agents[0]?.id ?? '',
      category: entry?.category ?? 'faq',
      title: entry?.title ?? '',
      content: entry?.content ?? '',
      language: entry?.language ?? 'en',
      active: entry?.active ?? true,
    })
  }, [open, entry, defaultAgentId, agents, form])

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      await saveKnowledge(tenantId, values, entry?.id)
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
      title={entry ? 'Edit knowledge' : 'Add approved knowledge'}
      description="Only active, approved entries are used by the public chatbot."
    >
      <form noValidate onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="knowledge-agent">Agent</Label>
          <Select id="knowledge-agent" {...form.register('agent_id')}>
            <option value="">Select an agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </Select>
          <FieldError>{form.formState.errors.agent_id?.message}</FieldError>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="knowledge-category">Category</Label>
            <Select id="knowledge-category" {...form.register('category')}>
              {knowledgeCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="knowledge-language">Language</Label>
            <Select id="knowledge-language" {...form.register('language')}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="knowledge-title">Title</Label>
          <Input id="knowledge-title" {...form.register('title')} />
          <FieldError>{form.formState.errors.title?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="knowledge-content">Content</Label>
          <Textarea id="knowledge-content" className="min-h-32" {...form.register('content')} />
          <FieldError>{form.formState.errors.content?.message}</FieldError>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" {...form.register('active')} />
          Active and approved for the chatbot
        </label>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Save knowledge</Button>
        </div>
      </form>
    </Modal>
  )
}
