import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Label, Textarea } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { sendInboxMessage } from '../api'
import { useInboxInvalidate } from '../hooks'
import { replySchema, type ReplyFormValues } from '../schemas'

type Props = {
  tenantId: string
  conversationId: string
  disabled?: boolean
}

const emptyValues: ReplyFormValues = { content: '', is_internal: false }

export function ReplyComposer({ tenantId, conversationId, disabled = false }: Props) {
  const { toast } = useToast()
  const invalidate = useInboxInvalidate(tenantId)
  const form = useForm<ReplyFormValues>({
    resolver: zodResolver(replySchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    form.reset(emptyValues)
  }, [conversationId, form])

  const isInternal = form.watch('is_internal')

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await sendInboxMessage(tenantId, conversationId, values)
      form.reset(emptyValues)
      toast({
        title: values.is_internal ? 'Internal note added' : 'Reply sent',
        description: values.is_internal ? 'Only your team can see this note.' : undefined,
      })
      invalidate()
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error) })
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {form.formState.errors.root?.message ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {form.formState.errors.root.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="inbox-reply" className="mb-0">
          {isInternal ? 'Internal note' : 'Reply'}
        </Label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-600">
          <input type="checkbox" className="size-4 accent-brand-600" {...form.register('is_internal')} />
          Internal note (team only)
        </label>
      </div>
      <Textarea
        id="inbox-reply"
        rows={3}
        disabled={disabled}
        placeholder={isInternal ? 'Add context for your team…' : 'Write a reply to the customer…'}
        {...form.register('content')}
      />
      <FieldError>{form.formState.errors.content?.message}</FieldError>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={form.formState.isSubmitting} disabled={disabled}>
          {isInternal ? 'Add note' : 'Send reply'}
        </Button>
      </div>
    </form>
  )
}
