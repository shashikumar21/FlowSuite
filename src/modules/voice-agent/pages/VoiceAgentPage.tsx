import { useState } from 'react'
import { Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, Plus, ShieldAlert, UserRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { useCallHandoffs, useCallSessions, useVoiceAgents, useVoiceMutations } from '../hooks'
import { callDirections, callLogSchema, callProviders, callStatuses, voiceAgentSchema, voiceBookingModes, voiceDirections, voiceProviders, type CallLogFormValues, type VoiceAgentFormValues } from '../schemas'
import type { VoiceAgentRow } from '../types'

const statusVariant: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral', active: 'success', paused: 'warning', archived: 'neutral',
  logged: 'neutral', queued: 'warning', ringing: 'warning', in_progress: 'warning', completed: 'success', missed: 'danger', failed: 'danger', cancelled: 'neutral',
  open: 'warning', assigned: 'warning', resolved: 'success', cancelled_h: 'neutral',
}

export function VoiceAgentPage() {
  const { activeTenant } = useTenant()
  const { toast } = useToast()
  const tenantId = activeTenant?.tenant_id
  const agents = useVoiceAgents(tenantId)
  const calls = useCallSessions(tenantId)
  const handoffs = useCallHandoffs(tenantId)
  const mutations = useVoiceMutations(tenantId)
  const [agentOpen, setAgentOpen] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<VoiceAgentRow | null>(null)

  const agentForm = useForm<VoiceAgentFormValues>({
    resolver: zodResolver(voiceAgentSchema),
    defaultValues: { name: '', status: 'draft', direction: 'inbound', languages: ['en', 'hi'], greeting: '', faq_summary: '', booking_mode: 'lead_capture', handoff_phone: '', provider: 'none', provider_phone_number: '' },
  })
  const callForm = useForm<CallLogFormValues>({
    resolver: zodResolver(callLogSchema),
    defaultValues: { agent_id: '', contact_id: '', direction: 'inbound', status: 'logged', provider: 'manual', from_number: '', to_number: '', language: 'en', started_at: '', ended_at: '', duration_seconds: '', outcome: '', summary: '', consent_recording: false, needs_handoff: false },
  })

  const openAgent = (agent?: VoiceAgentRow) => {
    setEditingAgent(agent ?? null)
    agentForm.reset(agent ? {
      name: agent.name, status: agent.status, direction: agent.direction, languages: agent.languages?.length ? agent.languages : ['en'],
      greeting: agent.greeting ?? '', faq_summary: agent.faq_summary ?? '', booking_mode: agent.booking_mode,
      handoff_phone: agent.handoff_phone ?? '', provider: agent.provider, provider_phone_number: agent.provider_phone_number ?? '',
    } : { name: '', status: 'draft', direction: 'inbound', languages: ['en', 'hi'], greeting: '', faq_summary: '', booking_mode: 'lead_capture', handoff_phone: '', provider: 'none', provider_phone_number: '' })
    setAgentOpen(true)
  }

  const submitAgent = agentForm.handleSubmit(async (values) => {
    try {
      await mutations.upsertAgent.mutateAsync({ agentId: editingAgent?.id ?? null, values })
      toast({ title: editingAgent ? 'Call agent updated' : 'Call agent created' })
      setAgentOpen(false)
    } catch (error) { agentForm.setError('root', { message: getErrorMessage(error) }) }
  })

  const submitCall = callForm.handleSubmit(async (values) => {
    try {
      await mutations.logCall.mutateAsync(values)
      toast({ title: 'Call logged' })
      setCallOpen(false)
      callForm.reset()
    } catch (error) { callForm.setError('root', { message: getErrorMessage(error) }) }
  })

  const anyError = agents.isError || calls.isError || handoffs.isError
  const anyLoading = agents.isLoading || calls.isLoading || handoffs.isLoading

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Automation</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">AI Call Agent</h1>
          <p className="mt-1 text-sm text-ink-500">Provider-agnostic call agent foundation. Configure agents, log calls/handoffs, and connect a telephony provider later.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { callForm.reset({ agent_id: agents.data?.[0]?.id ?? '', contact_id: '', direction: 'inbound', status: 'logged', provider: 'manual', from_number: '', to_number: '', language: 'en', started_at: '', ended_at: '', duration_seconds: '', outcome: '', summary: '', consent_recording: false, needs_handoff: false }); setCallOpen(true) }}><PhoneCall className="size-4" /> Log call</Button>
          <Button onClick={() => openAgent()}><Plus className="size-4" /> New agent</Button>
        </div>
      </div>

      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Provider not connected - safe local foundation</p>
            <p className="mt-1 text-amber-800">No telephony provider, no API keys, no outbound auto-dialing. Real calling needs Exotel/Twilio setup, server-side secrets, compliance checks, and hosted migration approval. Use this now to define agents and manually log call outcomes.</p>
          </div>
        </CardContent>
      </Card>

      {anyLoading ? <div className="space-y-3">{[0,1,2].map(i => <Skeleton key={i} className="h-20" />)}</div>
        : anyError ? <ErrorState message="Couldn't load voice agent data. If 0023 is not applied on hosted, this is expected." onRetry={() => { void agents.refetch(); void calls.refetch(); void handoffs.refetch() }} />
        : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Agents</p><p className="mt-1 text-2xl font-bold text-ink-900">{agents.data?.length ?? 0}</p></CardContent></Card>
              <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Call logs</p><p className="mt-1 text-2xl font-bold text-ink-900">{calls.data?.length ?? 0}</p></CardContent></Card>
              <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Open handoffs</p><p className="mt-1 text-2xl font-bold text-ink-900">{(handoffs.data ?? []).filter(h => h.status === 'open' || h.status === 'assigned').length}</p></CardContent></Card>
            </div>

            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-ink-900">Agents</h2><Button size="sm" variant="outline" onClick={() => openAgent()}><Plus className="size-4" /> Add</Button></div>
                {(agents.data ?? []).length === 0 ? <EmptyState icon={<Phone className="size-5" />} title="No call agents yet" description="Create an agent config now. Connect a provider later." /> : (
                  <div className="space-y-2">{agents.data!.map(agent => (
                    <button key={agent.id} type="button" onClick={() => openAgent(agent)} className="flex w-full items-center justify-between rounded-lg border border-ink-200 px-4 py-3 text-left hover:bg-ink-50">
                      <div>
                        <p className="font-medium text-ink-900">{agent.name}</p>
                        <p className="text-xs text-ink-500">{agent.direction} · {agent.languages.join(', ')} · {agent.booking_mode.replace('_', ' ')} · provider: {agent.provider}</p>
                      </div>
                      <Badge variant={statusVariant[agent.status] ?? 'neutral'}>{agent.status}</Badge>
                    </button>
                  ))}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3">
                <h2 className="text-sm font-semibold text-ink-900">Recent call logs</h2>
                {(calls.data ?? []).length === 0 ? <EmptyState icon={<PhoneIncoming className="size-5" />} title="No calls logged" description="Manual logs work before provider integration. Real call capture needs a provider webhook." /> : (
                  <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-ink-500"><tr><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Dir</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">From/To</th><th className="py-2 pr-3">Outcome</th></tr></thead><tbody className="divide-y divide-ink-100">
                    {calls.data!.map(call => (
                      <tr key={call.id}><td className="py-2 pr-3 text-xs text-ink-500">{formatDateTime(call.started_at ?? call.created_at)}</td><td className="py-2 pr-3">{call.direction === 'inbound' ? <PhoneIncoming className="size-4 text-ink-500" /> : <PhoneOutgoing className="size-4 text-ink-500" />}</td><td className="py-2 pr-3"><Badge variant={statusVariant[call.status] ?? 'neutral'}>{call.status}</Badge></td><td className="py-2 pr-3 text-xs text-ink-600">{call.from_number ?? '—'} {call.to_number ? `→ ${call.to_number}` : ''}</td><td className="py-2 pr-3 text-xs text-ink-600">{call.outcome ?? call.summary ?? '—'}</td></tr>
                    ))}
                  </tbody></table></div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3">
                <h2 className="text-sm font-semibold text-ink-900">Handoffs</h2>
                {(handoffs.data ?? []).length === 0 ? <EmptyState icon={<UserRound className="size-5" />} title="No handoffs" description="Handoffs appear when a call needs human follow-up." /> : (
                  <div className="space-y-2">{handoffs.data!.map(h => (
                    <div key={h.id} className="flex items-center justify-between rounded-lg border border-ink-200 px-4 py-3">
                      <div><p className="text-sm font-medium text-ink-900">{h.reason}</p><p className="text-xs text-ink-500">{formatDateTime(h.created_at)}</p></div>
                      <div className="flex items-center gap-2"><Badge variant={statusVariant[h.status] ?? 'neutral'}>{h.status}</Badge>{(h.status === 'open' || h.status === 'assigned') ? <Button size="sm" variant="outline" loading={mutations.resolveHandoff.isPending} onClick={() => mutations.resolveHandoff.mutate(h.id)}>Resolve</Button> : null}</div>
                    </div>
                  ))}</div>
                )}
              </CardContent>
            </Card>
          </>
        )}

      <Modal open={agentOpen} onClose={() => setAgentOpen(false)} title={editingAgent ? 'Edit call agent' : 'New call agent'} description="Provider-agnostic config. No provider secrets are stored here.">
        <form onSubmit={submitAgent} className="space-y-4" noValidate>
          {agentForm.formState.errors.root?.message ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{agentForm.formState.errors.root.message}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="va-name">Agent name</Label><Input id="va-name" {...agentForm.register('name')} /><FieldError>{agentForm.formState.errors.name?.message}</FieldError></div>
            <div><Label htmlFor="va-status">Status</Label><Select id="va-status" {...agentForm.register('status')}>{voiceDirections.length && ['draft','active','paused','archived'].map(s => <option key={s} value={s}>{s}</option>)}</Select></div>
            <div><Label htmlFor="va-dir">Direction</Label><Select id="va-dir" {...agentForm.register('direction')}>{voiceDirections.map(d => <option key={d} value={d}>{d}</option>)}</Select></div>
            <div><Label htmlFor="va-booking">Booking mode</Label><Select id="va-booking" {...agentForm.register('booking_mode')}>{voiceBookingModes.map(m => <option key={m} value={m}>{m.replace('_',' ')}</option>)}</Select></div>
            <div><Label htmlFor="va-provider">Provider (later)</Label><Select id="va-provider" {...agentForm.register('provider')}>{voiceProviders.map(p => <option key={p} value={p}>{p}</option>)}</Select></div>
            <div><Label htmlFor="va-provider-phone">Provider phone number</Label><Input id="va-provider-phone" {...agentForm.register('provider_phone_number')} placeholder="+91..." /></div>
            <div><Label htmlFor="va-handoff">Handoff phone</Label><Input id="va-handoff" {...agentForm.register('handoff_phone')} placeholder="+91..." /></div>
            <div><Label htmlFor="va-langs">Languages (comma separated)</Label><Input id="va-langs" defaultValue={agentForm.getValues('languages').join(', ')} onChange={(e) => agentForm.setValue('languages', e.target.value.split(',').map(s => s.trim()).filter(Boolean), { shouldValidate: true })} /><FieldError>{agentForm.formState.errors.languages?.message as string | undefined}</FieldError></div>
          </div>
          <div><Label htmlFor="va-greeting">Greeting</Label><Textarea id="va-greeting" {...agentForm.register('greeting')} /></div>
          <div><Label htmlFor="va-faq">Approved FAQ / knowledge summary</Label><Textarea id="va-faq" {...agentForm.register('faq_summary')} placeholder="Only approved clinic information the agent may say." /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAgentOpen(false)}>Cancel</Button><Button type="submit" loading={agentForm.formState.isSubmitting}>{editingAgent ? 'Save' : 'Create agent'}</Button></div>
        </form>
      </Modal>

      <Modal open={callOpen} onClose={() => setCallOpen(false)} title="Log call" description="Manual log until telephony provider is connected.">
        <form onSubmit={submitCall} className="space-y-4" noValidate>
          {callForm.formState.errors.root?.message ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{callForm.formState.errors.root.message}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="cl-dir">Direction</Label><Select id="cl-dir" {...callForm.register('direction')}>{callDirections.map(d => <option key={d} value={d}>{d}</option>)}</Select></div>
            <div><Label htmlFor="cl-status">Status</Label><Select id="cl-status" {...callForm.register('status')}>{callStatuses.map(s => <option key={s} value={s}>{s}</option>)}</Select></div>
            <div><Label htmlFor="cl-provider">Provider</Label><Select id="cl-provider" {...callForm.register('provider')}>{callProviders.map(p => <option key={p} value={p}>{p}</option>)}</Select></div>
            <div><Label htmlFor="cl-lang">Language</Label><Input id="cl-lang" {...callForm.register('language')} placeholder="en / hi / te" /></div>
            <div><Label htmlFor="cl-from">From number</Label><Input id="cl-from" {...callForm.register('from_number')} /></div>
            <div><Label htmlFor="cl-to">To number</Label><Input id="cl-to" {...callForm.register('to_number')} /></div>
            <div><Label htmlFor="cl-start">Started at</Label><Input id="cl-start" type="datetime-local" {...callForm.register('started_at')} /></div>
            <div><Label htmlFor="cl-dur">Duration (seconds)</Label><Input id="cl-dur" {...callForm.register('duration_seconds')} /><FieldError>{callForm.formState.errors.duration_seconds?.message}</FieldError></div>
          </div>
          <div><Label htmlFor="cl-outcome">Outcome</Label><Input id="cl-outcome" {...callForm.register('outcome')} placeholder="Lead captured / Callback requested / ..." /></div>
          <div><Label htmlFor="cl-summary">Summary</Label><Textarea id="cl-summary" {...callForm.register('summary')} /></div>
          <label className="flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" {...callForm.register('consent_recording')} /> Recording consent given</label>
          <label className="flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" {...callForm.register('needs_handoff')} /> Needs human handoff</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCallOpen(false)}>Cancel</Button><Button type="submit" loading={callForm.formState.isSubmitting}>Log call</Button></div>
        </form>
      </Modal>
    </div>
  )
}
