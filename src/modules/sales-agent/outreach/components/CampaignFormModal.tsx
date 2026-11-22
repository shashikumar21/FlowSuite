import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { useCreateCampaign } from '../hooks'
import { campaignCreateSchema, outreachTones, type CampaignCreateInput } from '../schemas'
import type { ProspectOption } from '../types'
import type { SuppressionRow } from '@/types/database'
import { isSuppressed, normalizeEmail } from '../utils'

export function CampaignFormModal({
  open,
  onClose,
  tenantId,
  prospects,
  suppression,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  prospects: ProspectOption[]
  suppression: SuppressionRow[]
  onCreated?: (campaignId: string, message: string) => void
}) {
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [tone, setTone] = useState<CampaignCreateInput['tone']>('professional')
  const [productOffered, setProductOffered] = useState('')
  const [problemAddressed, setProblemAddressed] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const create = useCreateCampaign(tenantId)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return prospects
    return prospects.filter((prospect) =>
      [prospect.business_name, prospect.industry, prospect.city, prospect.email]
        .some((value) => (value ?? '').toLowerCase().includes(term)),
    )
  }, [prospects, search])

  const selectedSuppressed = selected.filter((id) => {
    const prospect = prospects.find((item) => item.id === id)
    return prospect ? isSuppressed(normalizeEmail(prospect.email), suppression) : false
  }).length

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function reset() {
    setName('')
    setObjective('')
    setTone('professional')
    setProductOffered('')
    setProblemAddressed('')
    setSelected([])
    setSearch('')
    setValidationError(null)
    create.reset()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)
    const parsed = campaignCreateSchema.safeParse({
      name,
      objective,
      tone,
      product_offered: productOffered,
      problem_addressed: problemAddressed,
      prospect_ids: selected,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    try {
      const result = await create.mutateAsync(parsed.data)
      onCreated?.(result.campaignId, result.result)
      reset()
      onClose()
    } catch {
      // The mutation error is rendered below; keep the form open for correction.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!create.isPending) onClose() }}
      title="New outreach campaign"
      description="Creates real draft rows. No emails are sent."
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Campaign name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Spring dental outreach" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Tone</span>
            <Select value={tone} onChange={(event) => setTone(event.target.value as CampaignCreateInput['tone'])}>
              {outreachTones.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Objective</span>
          <Input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Book a 15-minute discovery call" />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Product or service offered</span>
            <Textarea value={productOffered} onChange={(event) => setProductOffered(event.target.value)} placeholder="What you offer and for whom" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Problem addressed</span>
            <Textarea value={problemAddressed} onChange={(event) => setProblemAddressed(event.target.value)} placeholder="The problem this prospect likely has" />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-ink-700">Recipients</span>
            <Badge variant="neutral">{selected.length} selected</Badge>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search prospects"
            />
          </div>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-ink-200">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-500">
                {prospects.length === 0 ? 'Add prospects first. No recipients are available.' : 'No prospects match your search.'}
              </p>
            ) : (
              filtered.map((prospect) => {
                const checked = selected.includes(prospect.id)
                const suppressed = isSuppressed(normalizeEmail(prospect.email), suppression)
                return (
                  <label
                    key={prospect.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-ink-100 px-3 py-2 last:border-0 hover:bg-ink-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(prospect.id)}
                      className="size-4 accent-brand-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">{prospect.business_name}</span>
                      <span className="block truncate text-xs text-ink-500">
                        {prospect.email || 'No email on file'}{prospect.industry ? ` · ${prospect.industry}` : ''}
                      </span>
                    </span>
                    {suppressed ? <Badge variant="danger">Suppressed</Badge> : null}
                    {checked ? <Check className="size-4 text-brand-600" /> : null}
                  </label>
                )
              })
            )}
          </div>
          {selectedSuppressed > 0 ? (
            <p className="text-xs text-amber-700">
              {selectedSuppressed} selected recipient(s) are suppressed and will be skipped by the server.
            </p>
          ) : null}
        </div>

        {(validationError || create.isError) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(create.error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Create campaign</Button>
        </div>
      </form>
    </Modal>
  )
}
