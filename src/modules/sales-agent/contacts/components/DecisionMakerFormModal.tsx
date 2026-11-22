import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { DecisionMakerRow } from '@/types/database'
import { useCreateDecisionMaker, useUpdateDecisionMaker } from '../hooks'
import { decisionMakerSchema } from '../schemas'
import type { ProspectOption } from '../api'

/**
 * Mount with a `key` derived from the decision maker id so the form state is
 * always fresh; there is no state-syncing effect to go stale.
 */
export function DecisionMakerFormModal({
  open,
  onClose,
  tenantId,
  prospects,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  prospects: ProspectOption[]
  initial?: DecisionMakerRow | null
  onSaved?: () => void
}) {
  const [prospectId, setProspectId] = useState(initial?.prospect_id ?? prospects[0]?.id ?? '')
  const [fullName, setFullName] = useState(initial?.full_name ?? '')
  const [jobTitle, setJobTitle] = useState(initial?.job_title ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(initial?.linkedin_url ?? '')
  const [researchSource, setResearchSource] = useState(initial?.research_source ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const create = useCreateDecisionMaker(tenantId)
  const update = useUpdateDecisionMaker(tenantId)
  const pending = create.isPending || update.isPending

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = decisionMakerSchema.safeParse({
      prospect_id: prospectId,
      full_name: fullName,
      job_title: jobTitle || null,
      email,
      phone: phone || null,
      linkedin_url: linkedinUrl || null,
      research_source: researchSource || null,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, values: parsed.data })
      } else {
        await create.mutateAsync(parsed.data)
      }
      onSaved?.()
      onClose()
    } catch {
      // Error is rendered below; keep the form open for correction.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!pending) onClose() }}
      title={initial ? 'Edit decision maker' : 'Add decision maker'}
      description="Stored for this prospect. Verification is recorded separately by a person."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Prospect</span>
          <Select value={prospectId} onChange={(event) => setProspectId(event.target.value)} disabled={Boolean(initial)}>
            {prospects.length === 0 ? <option value="">Add a prospect first</option> : null}
            {prospects.map((prospect) => (
              <option key={prospect.id} value={prospect.id}>{prospect.business_name}</option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Full name</span>
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Name of the contact" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Job title</span>
            <Input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Owner, manager, …" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Email</span>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Phone</span>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Optional" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">LinkedIn URL</span>
            <Input value={linkedinUrl} onChange={(event) => setLinkedinUrl(event.target.value)} placeholder="Optional" />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Research source</span>
          <Input value={researchSource} onChange={(event) => setResearchSource(event.target.value)} placeholder="Where this contact was found" />
        </label>

        {(validationError || create.isError || update.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(create.error ?? update.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" loading={pending}>{initial ? 'Save changes' : 'Add decision maker'}</Button>
        </div>
      </form>
    </Modal>
  )
}
