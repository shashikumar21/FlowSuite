import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { useRecordGrowthSubmission } from '../hooks'
import { emptySubmissionForm, submissionSchema, submissionStatuses, type SubmissionFormValues } from '../schemas'
import type { SiteOption } from '../types'
import { submissionStatusLabel } from '../utils'

export function SubmissionFormModal({
  open,
  onClose,
  tenantId,
  websites,
  defaultWebsiteId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  websites: SiteOption[]
  defaultWebsiteId?: string
  onSaved?: () => void
}) {
  const seed = emptySubmissionForm(defaultWebsiteId ?? websites[0]?.id ?? '')
  const [websiteId, setWebsiteId] = useState(seed.website_id)
  const [fullName, setFullName] = useState(seed.full_name)
  const [email, setEmail] = useState(seed.email)
  const [message, setMessage] = useState(seed.message ?? '')
  const [status, setStatus] = useState<string>(seed.status)
  const [validationError, setValidationError] = useState<string | null>(null)

  const create = useRecordGrowthSubmission(tenantId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = submissionSchema.safeParse({
      website_id: websiteId,
      full_name: fullName,
      email,
      message: message || null,
      status,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    try {
      await create.mutateAsync(parsed.data satisfies SubmissionFormValues)
      onSaved?.()
      onClose()
    } catch {
      // Keep the form open so the RPC error can be corrected.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!create.isPending) onClose() }}
      title="Record form submission"
      description="Enter a submission received elsewhere. This app does not host the form."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Website record</span>
          <Select value={websiteId} onChange={(event) => setWebsiteId(event.target.value)}>
            {websites.length === 0 ? <option value="">Add a website first</option> : null}
            {websites.map((site) => (
              <option key={site.id} value={site.id}>{site.name} ({site.slug})</option>
            ))}
          </Select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Name</span>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Email</span>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Message (optional)</span>
          <Textarea value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Status</span>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {submissionStatuses.map((item) => (
              <option key={item} value={item}>{submissionStatusLabel(item)}</option>
            ))}
          </Select>
        </label>

        {(validationError || create.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(create.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Record submission</Button>
        </div>
      </form>
    </Modal>
  )
}
