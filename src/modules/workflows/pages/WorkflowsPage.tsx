import { useEffect, useState } from 'react'
import { Plus, Pause, Play, Pencil, Trash2, Workflow, ShieldAlert, Send } from 'lucide-react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Input, Label, FieldError } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { copyText } from '@/lib/clipboard'
import { getErrorMessage } from '@/lib/errors'
import { fetchReviewRequests, ensureReviewRequestToken, setReviewRequestStatus, sendReviewRequestWhatsApp, type ReviewRequestRow } from '@/modules/reviews/api'
import { createWorkflow, deleteWorkflow, setWorkflowStatus, updateWorkflow } from '../api'
import { useWorkflows, useWorkflowsInvalidate } from '../hooks'
import { workflowFormSchema, type WorkflowFormValues } from '../schemas'
import type { WorkflowRow, WorkflowStatus, WorkflowTriggerType } from '../types'

const triggerLabels: Record<WorkflowTriggerType, string> = {
  appointment_created: 'Appointment created',
  appointment_completed: 'Appointment completed',
  appointment_cancelled: 'Appointment cancelled',
  appointment_rescheduled: 'Appointment rescheduled',
  lead_created: 'Lead created',
  contact_created: 'Contact created',
  manual: 'Manual',
}

const actionLabels: Record<string, string> = {
  create_task: 'Create task',
  notify_team: 'Notify team',
  add_tag: 'Add tag',
  webhook_placeholder: 'Webhook (placeholder)',
  send_review_request: 'Send review request (approval required)',
}

type WorkflowTemplate = {
  id: string
  name: string
  description: string
  trigger_type: WorkflowTriggerType
  actions: WorkflowFormValues['actions']
  note: string
}

const painterTemplates: WorkflowTemplate[] = [
  {
    id: 'painter-lead-capture',
    name: 'Painter - 1. Lead Capture (Quote Form)',
    description: 'When a new lead/contact is created from a quote form, notify the team and create a follow-up task.',
    trigger_type: 'lead_created',
    actions: [
      { type: 'notify_team', label: 'Notify team about new quote lead', config: { value: 'New painter quote lead captured. Call back quickly.' } },
      { type: 'create_task', label: 'Create callback task', config: { value: 'Call new lead within 15 minutes and qualify quote request.' } },
    ],
    note: 'Uses existing lead/contact triggers. Connect your website/form source to create leads in FlowSuite.',
  },
  {
    id: 'painter-missed-call',
    name: 'Painter - 2. Missed-Call Text Back',
    description: 'When a call is missed, prepare a text-back follow-up so the lead is not lost.',
    trigger_type: 'manual',
    actions: [
      { type: 'notify_team', label: 'Notify team of missed call', config: { value: 'Missed call detected. Send text back and call when available.' } },
      { type: 'webhook_placeholder', label: 'Text-back automation (provider required)', config: { value: 'Connect telephony/SMS provider. Auto-send is not enabled.' } },
    ],
    note: 'Missed-call trigger and auto SMS/WhatsApp sending require telephony provider setup; this template is a safe draft.',
  },
  {
    id: 'painter-booking-reminders',
    name: 'Painter - 3. Appointment Booking + Reminders',
    description: 'When an appointment is booked, notify team and queue reminder tasks.',
    trigger_type: 'appointment_created',
    actions: [
      { type: 'notify_team', label: 'Notify team of new booking', config: { value: 'New painting quote/appointment booked.' } },
      { type: 'create_task', label: 'Send appointment reminder', config: { value: 'Send reminder 24 hours before appointment (provider setup required for auto-send).' } },
    ],
    note: 'Booking trigger exists. Automated SMS/WhatsApp/email reminders need provider setup and approval-gated sending.',
  },
  {
    id: 'painter-review-request',
    name: 'Painter - 4. Google Review Request',
    description: 'After appointment completion, create a review request for approval.',
    trigger_type: 'appointment_completed',
    actions: [
      { type: 'send_review_request', label: 'Request review via FlowSuite link (approval required)', config: { channel: 'whatsapp', delay_hours: '2', review_link_type: 'flowsuite', review_url: '' } },
    ],
    note: 'Uses the existing review-request runner and FlowSuite review page. Creates pending approval records; no external auto-send.',
  },
  {
    id: 'painter-lead-nurture',
    name: 'Painter - 5. Lead Follow-Up Nurture',
    description: 'When a lead is created, create follow-up tasks to remind leads who enquired but did not book.',
    trigger_type: 'lead_created',
    actions: [
      { type: 'create_task', label: 'Day 1 follow-up', config: { value: 'Follow up with lead: answer questions and offer quote slot.' } },
      { type: 'create_task', label: 'Day 3 nurture follow-up', config: { value: 'Send/check-in follow-up if lead has not booked (provider setup required for auto-send).' } },
      { type: 'notify_team', label: 'Notify team for manual outreach', config: { value: 'Lead nurture sequence started. No external auto-send.' } },
    ],
    note: 'Creates workflow definition/tasks. Automated email/SMS nurture sending needs provider setup and approval-gated dispatch.',
  },
]

const statusVariant: Record<WorkflowStatus, 'success' | 'neutral' | 'warning'> = {
  active: 'success',
  draft: 'neutral',
  paused: 'warning',
}

function defaultValues(row?: WorkflowRow | null): WorkflowFormValues {
  if (!row) return { name: '', description: '', trigger_type: 'manual', status: 'draft', actions: [{ type: 'notify_team', label: 'Notify team', config: { value: '' } }] }
  return {
    name: row.name,
    description: row.description ?? '',
    trigger_type: row.trigger_type,
    status: row.status,
    actions: row.actions.length ? row.actions.map((a) => ({
      type: a.type,
      label: a.label,
      config: (a.type === 'send_review_request'
        ? {
            channel: a.config?.channel ?? 'whatsapp',
            delay_hours: a.config?.delay_hours ?? '2',
            review_link_type: a.config?.review_link_type ?? 'flowsuite',
            review_url: a.config?.review_url ?? '',
          }
        : { value: a.config?.value ?? a.config?.message ?? '' }) as Record<string, string>,
    })) : [{ type: 'notify_team', label: 'Notify team', config: { value: '' } }],
  }
}

export function WorkflowsPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const { toast } = useToast()
  const { data: workflows, isLoading, error, refetch } = useWorkflows(tenantId)
  const invalidate = useWorkflowsInvalidate(tenantId)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<WorkflowRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [reviewRequests, setReviewRequests] = useState<ReviewRequestRow[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const loadReviewRequests = async () => {
    if (!tenantId) return
    setReviewLoading(true)
    try { setReviewRequests(await fetchReviewRequests(tenantId)) } catch { /* ignore */ } finally { setReviewLoading(false) }
  }

  useEffect(() => { void loadReviewRequests() }, [tenantId])

  const copyReviewLink = async (row: ReviewRequestRow) => {
    if (!tenantId) return
    let url: string
    try {
      const token = await ensureReviewRequestToken(tenantId, row.id)
      url = `${window.location.origin}/r/${token}`
    } catch (e) {
      toast({ title: 'Could not generate review link', description: getErrorMessage(e), variant: 'error' })
      return
    }
    const copied = await copyText(url)
    toast({
      title: copied ? 'Review link copied' : 'Copy this review link',
      description: url,
      variant: copied ? 'success' : 'info',
    })
    void loadReviewRequests()
  }

  const updateReviewStatus = async (row: ReviewRequestRow, status: 'approved' | 'cancelled') => {
    if (!tenantId) return
    try {
      await setReviewRequestStatus(tenantId, row.id, status)
      toast({ title: status === 'approved' ? 'Review request approved' : 'Review request cancelled' })
      void loadReviewRequests()
    } catch (e) { toast({ title: 'Could not update review request', description: getErrorMessage(e), variant: 'error' }) }
  }

  const sendWhatsApp = async (row: ReviewRequestRow) => {
    if (!tenantId) return
    if (!window.confirm(`Send WhatsApp review request to ${row.customer_name || 'this customer'}? This sends a real message.`)) return
    setSendingId(row.id)
    try {
      await sendReviewRequestWhatsApp(tenantId, row.id)
      toast({ title: 'WhatsApp review request sent' })
      void loadReviewRequests()
    } catch (e) {
      toast({ title: 'Could not send WhatsApp message', description: getErrorMessage(e), variant: 'error' })
      void loadReviewRequests()
    } finally { setSendingId(null) }
  }

  const form = useForm<WorkflowFormValues>({ resolver: zodResolver(workflowFormSchema), defaultValues: defaultValues() })
  const actions = useFieldArray({ control: form.control, name: 'actions' })

  const openCreate = () => { setEditing(null); form.reset(defaultValues()); setOpen(true) }
  const openEdit = (row: WorkflowRow) => { setEditing(row); form.reset(defaultValues(row)); setOpen(true) }
  const installTemplate = async (tpl: WorkflowTemplate) => {
    if (!tenantId) return
    try {
      await createWorkflow(tenantId, {
        name: tpl.name,
        description: tpl.description,
        trigger_type: tpl.trigger_type,
        status: 'draft',
        actions: tpl.actions,
      })
      toast({ title: 'Workflow template added', description: `${tpl.name} created as draft.` })
      invalidate()
    } catch (e) {
      toast({ title: 'Could not add template', description: getErrorMessage(e), variant: 'error' })
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!tenantId) return
    setSaving(true)
    try {
      if (editing) {
        await updateWorkflow(tenantId, editing.id, values)
        toast({ title: 'Workflow updated' })
      } else {
        await createWorkflow(tenantId, values)
        toast({ title: 'Workflow created' })
      }
      setOpen(false)
      invalidate()
    } catch (e) {
      toast({ title: 'Could not save workflow', description: getErrorMessage(e), variant: 'error' })
    } finally { setSaving(false) }
  })

  const toggleStatus = async (row: WorkflowRow) => {
    if (!tenantId) return
    const next: WorkflowStatus = row.status === 'active' ? 'paused' : 'active'
    try {
      await setWorkflowStatus(tenantId, row.id, next)
      toast({ title: next === 'active' ? 'Workflow activated' : 'Workflow paused' })
      invalidate()
    } catch (e) { toast({ title: 'Could not update status', description: getErrorMessage(e), variant: 'error' }) }
  }

  const onDelete = async (row: WorkflowRow) => {
    if (!tenantId) return
    if (!window.confirm(`Delete workflow "${row.name}"? This cannot be undone.`)) return
    try {
      await deleteWorkflow(tenantId, row.id)
      toast({ title: 'Workflow deleted' })
      invalidate()
    } catch (e) { toast({ title: 'Could not delete workflow', description: getErrorMessage(e), variant: 'error' }) }
  }

  if (!tenantId) return <ErrorState message="Select a business to manage workflows." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Automation</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Workflows</h1>
          <p className="mt-1 text-sm text-ink-500">Define automation rules for your business. Review-request runner creates pending-approval records; no external messages are sent automatically.</p>
        </div>
        <Button onClick={openCreate}><Plus className="size-4" /> New workflow</Button>
      </div>

      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Safe automation MVP</p>
            <p className="mt-1 text-amber-800">Workflow definitions are active. The review-request runner creates <strong>pending approval</strong> records when appointments complete. No external messages are sent automatically.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-5 space-y-4">
          <div>
            <p className="font-semibold text-ink-900">Painter workflow templates</p>
            <p className="text-sm text-ink-500">Prebuilt drafts for common painter business automations. Add a template, then review and activate when your providers/setup are ready.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {painterTemplates.map((tpl) => (
              <div key={tpl.id} className="rounded-lg border border-line-200 p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink-900">{tpl.name}</p>
                  <Badge variant="neutral">{triggerLabels[tpl.trigger_type]}</Badge>
                </div>
                <p className="text-sm text-ink-600">{tpl.description}</p>
                <p className="text-xs text-ink-500">{tpl.note}</p>
                <Button variant="outline" size="sm" onClick={() => void installTemplate(tpl)}><Plus className="size-4" /> Add template</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {error ? <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} /> : null}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : (workflows ?? []).length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Workflow className="mx-auto size-10 text-ink-300" /><p className="mt-3 font-medium text-ink-900">No workflows yet</p><p className="mt-1 text-sm text-ink-500">Create your first workflow definition to plan automation.</p><Button className="mt-4" onClick={openCreate}><Plus className="size-4" /> Create workflow</Button></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(workflows ?? []).map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-900">{row.name}</p>
                    <Badge variant={statusVariant[row.status]}>{row.status}</Badge>
                    <Badge variant="neutral">{triggerLabels[row.trigger_type]}</Badge>
                  </div>
                  {row.description ? <p className="mt-1 text-sm text-ink-500">{row.description}</p> : null}
                  <p className="mt-1 text-xs text-ink-400">{row.actions.length} action{row.actions.length === 1 ? '' : 's'} · Runs: {row.run_count} · No auto-send</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void toggleStatus(row)}>{row.status === 'active' ? <><Pause className="size-4" /> Pause</> : <><Play className="size-4" /> Activate</>}</Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(row)}><Pencil className="size-4" /> Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => void onDelete(row)}><Trash2 className="size-4" /> Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="py-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-ink-900">Review requests (approval-gated)</p>
              <p className="text-sm text-ink-500">Appointment-completed workflows create pending requests. Approve, then explicitly send WhatsApp. No auto-send.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadReviewRequests()} loading={reviewLoading}>Refresh</Button>
          </div>
          {reviewRequests.length === 0 ? <p className="text-sm text-ink-500">No review requests yet.</p> : (
            <div className="space-y-2">
              {reviewRequests.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-line-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <p className="font-medium text-ink-900">{r.customer_name || 'Customer'} · <span className="uppercase">{r.channel}</span> · {r.status}</p>
                    <p className="text-ink-500">Rating: {r.rating ?? '—'} · AI: {r.ai_suggestion_status ?? '—'} {r.public_token ? '· Link ready' : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => void copyReviewLink(r)}>Copy review link</Button>
                    {r.status === 'pending_approval' ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => void updateReviewStatus(r, 'approved')}>Approve</Button>
                        <Button variant="outline" size="sm" onClick={() => void updateReviewStatus(r, 'cancelled')}>Cancel</Button>
                      </>
                    ) : null}
                    {r.status === 'approved' && r.channel === 'whatsapp' ? (
                      <Button size="sm" onClick={() => void sendWhatsApp(r)} loading={sendingId === r.id}><Send className="size-4" /> Send WhatsApp</Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit workflow' : 'New workflow'}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Workflow name</Label>
            <Input {...form.register('name')} />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-700">Description</label>
            <textarea className="w-full rounded-lg border border-line-200 px-3 py-2 text-sm" rows={2} {...form.register('description')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">Trigger</label>
              <select className="w-full rounded-lg border border-line-200 px-3 py-2 text-sm" {...form.register('trigger_type')}>
                {Object.entries(triggerLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">Status</label>
              <select className="w-full rounded-lg border border-line-200 px-3 py-2 text-sm" {...form.register('status')}>
                <option value="draft">Draft</option>
                <option value="active">Active (definition only)</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-ink-700">Actions</label>
              <Button type="button" variant="outline" size="sm" onClick={() => actions.append({ type: 'notify_team', label: 'Notify team', config: { value: '' } })}><Plus className="size-4" /> Add action</Button>
            </div>
            {form.formState.errors.actions?.message ? <p className="text-xs text-red-600">{form.formState.errors.actions.message}</p> : null}
            {actions.fields.map((field, idx) => {
              const type = form.watch(`actions.${idx}.type` as const)
              return (
              <div key={field.id} className="rounded-lg border border-line-200 p-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <select className="w-full rounded-lg border border-line-200 px-3 py-2 text-sm" {...form.register(`actions.${idx}.type` as const)}>
                    {Object.entries(actionLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <Input placeholder="Action label" {...form.register(`actions.${idx}.label` as const)} />
                </div>
                {type === 'send_review_request' ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <Label>Channel</Label>
                      <select className="w-full rounded-lg border border-line-200 px-3 py-2 text-sm" {...form.register(`actions.${idx}.config.channel` as const)}>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="sms">SMS</option>
                        <option value="email">Email</option>
                      </select>
                    </div>
                    <div>
                      <Label>Delay (hours)</Label>
                      <Input type="number" min={0} step={1} {...form.register(`actions.${idx}.config.delay_hours` as const)} />
                    </div>
                    <div>
                      <Label>Review link</Label>
                      <select className="w-full rounded-lg border border-line-200 px-3 py-2 text-sm" {...form.register(`actions.${idx}.config.review_link_type` as const)}>
                        <option value="flowsuite">FlowSuite review link</option>
                        <option value="google">Google review URL</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <Label>Review URL (if Google/Custom)</Label>
                      <Input placeholder="https://..." {...form.register(`actions.${idx}.config.review_url` as const)} />
                      <p className="mt-1 text-xs text-ink-500">Safe v1: creates a pending approval/request record. No auto-send until provider setup and explicit approval.</p>
                    </div>
                  </div>
                ) : (
                  <Input placeholder="Config/value (e.g. message, tag, or URL placeholder)" {...form.register(`actions.${idx}.config.value` as const)} />
                )}
                <div className="flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={() => actions.remove(idx)} disabled={actions.fields.length === 1}>Remove</Button></div>
              </div>
            )})}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing ? 'Save changes' : 'Create workflow'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
