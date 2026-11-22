import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { GrowthSiteRow } from '@/types/database'
import { useCreateGrowthSite, useUpdateGrowthSite } from '../hooks'
import { emptySiteForm, siteSchema, siteStatuses, type SiteFormValues } from '../schemas'
import { siteStatusLabel } from '../utils'

export function SiteFormModal({
  open,
  onClose,
  tenantId,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  initial?: GrowthSiteRow | null
  onSaved?: () => void
}) {
  const seed: SiteFormValues = initial
    ? {
        name: initial.name,
        slug: initial.slug,
        domain: initial.domain,
        status: initial.status,
        notes: initial.notes,
      }
    : emptySiteForm()
  const [name, setName] = useState(seed.name)
  const [slug, setSlug] = useState(seed.slug)
  const [domain, setDomain] = useState(seed.domain ?? '')
  const [status, setStatus] = useState<string>(seed.status)
  const [notes, setNotes] = useState(seed.notes ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const create = useCreateGrowthSite(tenantId)
  const update = useUpdateGrowthSite(tenantId)
  const pending = create.isPending || update.isPending

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = siteSchema.safeParse({
      name,
      slug,
      domain: domain || null,
      status,
      notes: notes || null,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    try {
      if (initial) await update.mutateAsync({ id: initial.id, values: parsed.data })
      else await create.mutateAsync(parsed.data)
      onSaved?.()
      onClose()
    } catch {
      // Keep the form open so the RPC error can be corrected.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!pending) onClose() }}
      title={initial ? 'Edit website record' : 'New website record'}
      description="A page record only. No hosting, DNS or custom domain is provisioned."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Page name</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Appointment landing page" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Slug</span>
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="appointment-landing" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Status</span>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {siteStatuses.map((item) => (
                <option key={item} value={item}>{siteStatusLabel(item)}</option>
              ))}
            </Select>
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Domain (optional, record only)</span>
          <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="clinic.example.com" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Notes (optional)</span>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        {(validationError || create.isError || update.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(create.error ?? update.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" loading={pending}>{initial ? 'Save changes' : 'Add website'}</Button>
        </div>
      </form>
    </Modal>
  )
}
