import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { requestAiDraft } from '../api'
import { useSaveDraft, useSubmitForApproval } from '../hooks'
import {
  emailDraftInputSchema,
  generatedDraftSchema,
  outreachTones,
  type OutreachTone,
} from '../schemas'
import type { DecisionMakerOption, DraftView } from '../types'
import { composeEmailBody, isSuppressed, messageStatusLabel } from '../utils'
import type { SuppressionRow } from '@/types/database'

export function DraftEditor({
  view,
  tenantId,
  decisionMakers,
  suppression,
  onChanged,
}: {
  view: DraftView
  tenantId: string
  decisionMakers: DecisionMakerOption[]
  suppression: SuppressionRow[]
  onChanged?: () => void
}) {
  const { message, prospect, decisionMaker } = view
  const [subject, setSubject] = useState(message.subject)
  const [opening, setOpening] = useState(message.opening ?? '')
  const [body, setBody] = useState(message.body)
  const [cta, setCta] = useState(message.cta ?? '')
  const [followUpSubject, setFollowUpSubject] = useState(message.follow_up_subject ?? '')
  const [followUpBody, setFollowUpBody] = useState(message.follow_up_body ?? '')
  const [productOffered, setProductOffered] = useState('')
  const [problemAddressed, setProblemAddressed] = useState('')
  const [objective, setObjective] = useState('')
  const [tone, setTone] = useState<OutreachTone>('professional')
  const [decisionMakerId, setDecisionMakerId] = useState(decisionMaker?.id ?? '')
  const [generationSource, setGenerationSource] = useState<'manual' | 'ai'>(message.generation_source)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const save = useSaveDraft(tenantId)
  const submit = useSubmitForApproval(tenantId)
  const busy = generating || save.isPending || submit.isPending
  const suppressed = isSuppressed(message.recipient_email ?? '', suppression)
  const availableDecisionMakers = decisionMakers.filter((item) => item.prospect_id === message.prospect_id)

  useEffect(() => {
    setSubject(message.subject)
    setOpening(message.opening ?? '')
    setBody(message.body)
    setCta(message.cta ?? '')
    setFollowUpSubject(message.follow_up_subject ?? '')
    setFollowUpBody(message.follow_up_body ?? '')
    setDecisionMakerId(message.decision_maker_id ?? '')
    setGenerationSource(message.generation_source)
    setNotice(null)
    setError(null)
  }, [message])

  function buildValues() {
    return {
      subject,
      body,
      opening: opening || null,
      cta: cta || null,
      followUpSubject: followUpSubject || null,
      followUpBody: followUpBody || null,
      decisionMakerId: decisionMakerId || null,
      generationSource,
    }
  }

  async function handleGenerate() {
    setError(null)
    setNotice(null)
    const parsed = emailDraftInputSchema.safeParse({
      prospect_id: message.prospect_id,
      decision_maker_id: decisionMakerId || null,
      business_website: prospect?.website ?? '',
      industry: prospect?.industry ?? '',
      product_offered: productOffered,
      problem_addressed: problemAddressed,
      campaign_objective: objective,
      tone,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Complete the writing inputs first.')
      return
    }
    setGenerating(true)
    try {
      const draft = await requestAiDraft(tenantId, parsed.data)
      setSubject(draft.subject)
      setOpening(draft.opening)
      setBody(composeEmailBody(draft))
      setCta(draft.cta)
      setFollowUpSubject(draft.follow_up_subject)
      setFollowUpBody(draft.follow_up_body)
      setGenerationSource('ai')
      setNotice('Draft generated. Review and edit it, then save. Nothing has been sent.')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave(event?: FormEvent) {
    event?.preventDefault()
    setError(null)
    setNotice(null)
    const parsed = generatedDraftSchema.safeParse({ subject, opening, body, cta, follow_up_subject: followUpSubject, follow_up_body: followUpBody })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the draft fields.')
      return
    }
    try {
      await save.mutateAsync({ messageId: message.id, values: buildValues() })
      setNotice('Draft saved. It is not queued and has not been sent.')
      onChanged?.()
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  async function handleSubmitForApproval() {
    setError(null)
    setNotice(null)
    const parsed = generatedDraftSchema.safeParse({ subject, opening, body, cta, follow_up_subject: followUpSubject, follow_up_body: followUpBody })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the draft fields.')
      return
    }
    try {
      await save.mutateAsync({ messageId: message.id, values: buildValues() })
      await submit.mutateAsync(message.id)
      setNotice('Submitted for approval. No email was sent.')
      onChanged?.()
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="brand">{messageStatusLabel(message.status)}</Badge>
        <Badge variant={generationSource === 'ai' ? 'success' : 'neutral'}>
          {generationSource === 'ai' ? 'AI-generated draft' : 'Manually written'}
        </Badge>
      </div>

      <div className="rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm">
        <p className="font-semibold text-ink-900">{prospect?.business_name ?? 'Prospect unavailable'}</p>
        <p className="mt-0.5 text-xs text-ink-600">
          {message.recipient_email || 'No recipient email on file'}
          {prospect?.industry ? ` · ${prospect.industry}` : ''}
          {prospect?.website ? ` · ${prospect.website}` : ''}
        </p>
      </div>

      {suppressed ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          This recipient is on the suppression list. The server will refuse approval and queueing.
        </p>
      ) : null}

      <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
        <p className="text-xs font-semibold text-brand-800">Writing inputs</p>
        <p className="mt-1 text-xs text-brand-700">Used only to build this draft. They are not sent to the recipient.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Product or service offered</span>
            <Input value={productOffered} onChange={(event) => setProductOffered(event.target.value)} placeholder="What you offer" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Problem addressed</span>
            <Input value={problemAddressed} onChange={(event) => setProblemAddressed(event.target.value)} placeholder="The problem you solve" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Campaign objective</span>
            <Input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Book a discovery call" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Tone</span>
            <Select value={tone} onChange={(event) => setTone(event.target.value as OutreachTone)}>
              {outreachTones.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-ink-700">Decision maker (optional)</span>
            <Select value={decisionMakerId} onChange={(event) => setDecisionMakerId(event.target.value)}>
              <option value="">No decision maker selected</option>
              {availableDecisionMakers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}{item.job_title ? ` — ${item.job_title}` : ''}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <Button className="mt-3" variant="secondary" size="sm" loading={generating} disabled={busy} onClick={() => void handleGenerate()}>
          <Sparkles className="size-4" /> Generate AI draft
        </Button>
      </div>

      <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink-900">Editable draft</p>
          <Badge variant="warning">Not sent</Badge>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Subject</span>
          <Input value={subject} onChange={(event) => { setSubject(event.target.value); setGenerationSource('manual') }} disabled={busy} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Opening</span>
          <Textarea value={opening} onChange={(event) => { setOpening(event.target.value); setGenerationSource('manual') }} disabled={busy} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Body</span>
          <Textarea className="min-h-48" value={body} onChange={(event) => { setBody(event.target.value); setGenerationSource('manual') }} disabled={busy} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Call to action</span>
          <Textarea value={cta} onChange={(event) => { setCta(event.target.value); setGenerationSource('manual') }} disabled={busy} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Follow-up subject</span>
            <Input value={followUpSubject} onChange={(event) => setFollowUpSubject(event.target.value)} disabled={busy} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Follow-up draft</span>
            <Textarea value={followUpBody} onChange={(event) => setFollowUpBody(event.target.value)} disabled={busy} />
          </label>
        </div>

        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {notice ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}

        <div className="flex flex-wrap justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="submit" variant="outline" loading={save.isPending} disabled={busy}>Save draft</Button>
          <Button
            type="button"
            loading={submit.isPending}
            disabled={busy || message.status !== 'draft' || suppressed}
            onClick={() => void handleSubmitForApproval()}
          >
            Save &amp; submit for approval
          </Button>
        </div>
      </form>
    </div>
  )
}
