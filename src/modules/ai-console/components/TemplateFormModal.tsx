import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { MessageTemplateRow } from '@/types/database'
import { saveTemplate } from '../api'
import { languageOptions, templateCategoryOptions, templateSchema } from '../schemas'
import type { TemplateFormValues } from '../schemas'

export function TemplateFormModal({
  open,
  onClose,
  tenantId,
  template,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  template: MessageTemplateRow | null
  onSaved: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      template_key: '',
      provider: 'whatsapp',
      provider_template_name: '',
      language: 'en',
      category: 'utility',
      content: '',
      status: 'draft',
    },
  })

  useEffect(() => {
    if (!open) return
    setError(null)
    form.reset({
      template_key: template?.template_key ?? '',
      provider: template?.provider ?? 'whatsapp',
      provider_template_name: template?.provider_template_name ?? '',
      language: template?.language ?? 'en',
      category: template?.category ?? 'utility',
      content: template?.content ?? '',
      status: template?.status ?? 'draft',
    })
  }, [open, template, form])

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      await saveTemplate(tenantId, values)
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
      title={template ? 'Edit message template' : 'New message template'}
      description="Meta must approve the provider template before it can be sent outside a 24-hour session."
    >
      <form noValidate onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="template-key">Template key</Label>
          <Input id="template-key" placeholder="appointment_confirmation" {...form.register('template_key')} />
          <FieldError>{form.formState.errors.template_key?.message}</FieldError>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="template-provider">Provider</Label>
            <Select id="template-provider" {...form.register('provider')}>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="template-language">Language</Label>
            <Select id="template-language" {...form.register('language')}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="template-category">Category</Label>
            <Select id="template-category" {...form.register('category')}>
              {templateCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="template-status">Status</Label>
            <Select id="template-status" {...form.register('status')}>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="template-provider-name">Meta template name</Label>
          <Input id="template-provider-name" placeholder="review_request_v1" {...form.register('provider_template_name')} />
          <p className="mt-1 text-xs text-ink-500">
            Must exactly match the name Meta approved. Required for WhatsApp review requests (template key <code>review_request</code>) and any send outside Meta&apos;s 24-hour window.
          </p>
        </div>
        <div>
          <Label htmlFor="template-content">Content</Label>
          <Textarea id="template-content" {...form.register('content')} />
          <FieldError>{form.formState.errors.content?.message}</FieldError>
        </div>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Save template</Button>
        </div>
      </form>
    </Modal>
  )
}
