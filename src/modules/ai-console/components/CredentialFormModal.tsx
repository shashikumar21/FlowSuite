import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { ChannelRow } from '@/types/database'
import { saveCredential } from '../api'
import { credentialProviderOptions, credentialSchema } from '../schemas'
import type { CredentialFormValues } from '../schemas'

export function CredentialFormModal({
  open,
  onClose,
  tenantId,
  channels,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  channels: ChannelRow[]
  onSaved: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<CredentialFormValues>({
    resolver: zodResolver(credentialSchema),
    defaultValues: { channel_id: '', provider: 'whatsapp', secret_ref: '', external_identifier: '' },
  })

  useEffect(() => {
    if (!open) return
    setError(null)
    form.reset({
      channel_id: channels.find((channel) => channel.channel_type === 'whatsapp')?.id ?? channels[0]?.id ?? '',
      provider: 'whatsapp',
      secret_ref: '',
      external_identifier: '',
    })
  }, [open, channels, form])

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      await saveCredential(tenantId, values)
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
      title="Link a channel credential"
      description="Enter the name of a server-side secret. Tokens and API keys must never be entered here."
    >
      <form noValidate onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="credential-channel">Active channel</Label>
          <Select id="credential-channel" {...form.register('channel_id')}>
            <option value="">Select a channel</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name} ({channel.channel_type})
              </option>
            ))}
          </Select>
          <FieldError>{form.formState.errors.channel_id?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="credential-provider">Provider</Label>
          <Select id="credential-provider" {...form.register('provider')}>
            {credentialProviderOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="credential-secret">Secret reference name</Label>
          <Input id="credential-secret" placeholder="WHATSAPP_ACCESS_TOKEN" {...form.register('secret_ref')} />
          <p className="mt-1 text-xs text-ink-500">Uppercase Supabase secret name only, e.g. WHATSAPP_ACCESS_TOKEN.</p>
          <FieldError>{form.formState.errors.secret_ref?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="credential-external">External identifier (optional)</Label>
          <Input
            id="credential-external"
            placeholder="WhatsApp phone number ID"
            {...form.register('external_identifier')}
          />
          <FieldError>{form.formState.errors.external_identifier?.message}</FieldError>
        </div>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Save credential reference</Button>
        </div>
      </form>
    </Modal>
  )
}
