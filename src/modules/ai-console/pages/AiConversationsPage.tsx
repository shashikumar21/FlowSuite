import { useState } from 'react'
import { MessageSquare, ShieldAlert } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Label, Select } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import type { ConversationRow } from '@/types/database'
import { enqueueFollowUp, setConsent, setConversationAiStatus } from '../api'
import { ClassificationBadge, ConsentStatusBadge, ConversationAiStatusBadge, JobStatusBadge } from '../components/StatusBadges'
import { HandoffModal } from '../components/HandoffModal'
import { useAiConsoleInvalidate, useAiConversationsData } from '../hooks'
import { consentChannelOptions, consentSchema } from '../schemas'

type Tab = 'conversations' | 'assessments' | 'followups' | 'consents'

const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'conversations', label: 'Conversations' },
  { key: 'assessments', label: 'Lead assessments' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'consents', label: 'Consent' },
]

export function AiConversationsPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const query = useAiConversationsData(tenantId)
  const invalidate = useAiConsoleInvalidate(tenantId)
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('conversations')
  const [statusFilter, setStatusFilter] = useState('all')
  const [handoffConversation, setHandoffConversation] = useState<ConversationRow | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [contactId, setContactId] = useState('')
  const [sequenceId, setSequenceId] = useState('')
  const [followUpChannel, setFollowUpChannel] = useState('whatsapp')
  const [consentContact, setConsentContact] = useState('')
  const [consentChannel, setConsentChannel] = useState('whatsapp')
  const [consentStatus, setConsentStatus] = useState('opt_in')
  const [consentSource, setConsentSource] = useState('staff')
  const [consentError, setConsentError] = useState<string | null>(null)

  if (query.isError) {
    return <Card><CardContent><ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /></CardContent></Card>
  }
  if (query.isLoading || !query.data) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-80" /></div>
  }

  const data = query.data
  const contactName = (id: string | null) => {
    if (!id) return 'Unknown contact'
    const contact = data.contacts.find((item) => item.id === id)
    if (!contact) return id.slice(0, 8)
    return `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ''}`
  }
  const latestAssessment = (conversationId: string) =>
    data.assessments.find((assessment) => assessment.conversation_id === conversationId)
  const filteredConversations = data.conversations.filter((conversation) =>
    statusFilter === 'all' ? true : conversation.ai_status === statusFilter,
  )

  const changeStatus = async (conversation: ConversationRow, status: 'active' | 'paused' | 'closed') => {
    if (!tenantId) return
    setActionError(null)
    try {
      await setConversationAiStatus(tenantId, conversation.id, status)
      toast({ title: `AI set to ${status}`, description: contactName(conversation.contact_id) })
      invalidate()
    } catch (cause) {
      setActionError(getErrorMessage(cause))
    }
  }

  const queueFollowUp = async () => {
    if (!tenantId) return
    setActionError(null)
    if (!contactId || !sequenceId) {
      setActionError('Choose a contact and an active sequence.')
      return
    }
    try {
      await enqueueFollowUp({ tenantId, contactId, sequenceId, channel: followUpChannel as 'whatsapp' | 'sms' | 'email' })
      toast({ title: 'Follow-up queued', description: 'Consent and automation status were checked by the database.' })
      setContactId('')
      setSequenceId('')
      invalidate()
    } catch (cause) {
      setActionError(getErrorMessage(cause))
    }
  }

  const saveConsent = async () => {
    if (!tenantId) return
    setConsentError(null)
    const parsed = consentSchema.safeParse({
      channel: consentChannel,
      status: consentStatus,
      source: consentSource,
    })
    if (!parsed.success || !consentContact) {
      setConsentError(!consentContact ? 'Choose a contact.' : 'Check the consent details.')
      return
    }
    try {
      await setConsent(tenantId, consentContact, parsed.data)
      toast({ title: 'Consent updated', description: `${parsed.data.status} for ${parsed.data.channel}` })
      invalidate()
    } catch (cause) {
      setConsentError(getErrorMessage(cause))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">AI conversations</h1>
        <p className="mt-1 text-sm text-ink-500">
          Review AI-tagged conversations, lead assessments, consent and follow-up jobs. Handoff and status changes write
          through tenant-checked RPCs.
        </p>
      </div>
      {actionError ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
      {!data.canManage ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <p>Configuration and credential data are limited to owners and admins by the database.</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={tab === item.key ? 'primary' : 'outline'}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {tab === 'conversations' ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Conversations</CardTitle>
              <CardDescription>{filteredConversations.length} shown · bot replies stop after handoff, pause or close</CardDescription>
            </div>
            <div className="w-48">
              <Label htmlFor="ai-status-filter">AI status</Label>
              <Select id="ai-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="handed_off">Handed off</option>
                <option value="closed">Closed</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {filteredConversations.length === 0 ? (
              <EmptyState icon={<MessageSquare className="size-5" />} title="No conversations" description="AI conversations appear here after the chatbot or WhatsApp webhook is live." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-5 py-3">Channel</th>
                      <th className="px-5 py-3">AI status</th>
                      <th className="px-5 py-3">Assessment</th>
                      <th className="px-5 py-3">Last message</th>
                      <th className="px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {filteredConversations.map((conversation) => {
                      const assessment = latestAssessment(conversation.id)
                      return (
                        <tr key={conversation.id}>
                          <td className="px-5 py-3 font-medium text-ink-900">{contactName(conversation.contact_id)}</td>
                          <td className="px-5 py-3 text-ink-600">{conversation.channel}</td>
                          <td className="px-5 py-3"><ConversationAiStatusBadge status={conversation.ai_status} /></td>
                          <td className="px-5 py-3">{assessment ? <ClassificationBadge value={assessment.classification} /> : <span className="text-ink-400">—</span>}</td>
                          <td className="px-5 py-3 text-ink-500">{formatDateTime(conversation.last_message_at)}</td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="outline" onClick={() => setHandoffConversation(conversation)}>Hand off</Button>
                              {conversation.ai_status === 'active' ? (
                                <Button size="sm" variant="ghost" onClick={() => void changeStatus(conversation, 'paused')}>Pause</Button>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => void changeStatus(conversation, 'active')}>Resume</Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => void changeStatus(conversation, 'closed')}>Close</Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'assessments' ? (
        <Card>
          <CardHeader>
            <CardTitle>Lead assessments</CardTitle>
            <CardDescription>Validated classifications only. The system does not invent numeric lead scores.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {data.assessments.length === 0 ? (
              <EmptyState title="No assessments yet" description="Qualification results appear here after live AI requests." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-5 py-3">Contact</th>
                      <th className="px-5 py-3">Classification</th>
                      <th className="px-5 py-3">Summary</th>
                      <th className="px-5 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {data.assessments.map((assessment) => (
                      <tr key={assessment.id}>
                        <td className="px-5 py-3 font-medium text-ink-900">{contactName(assessment.contact_id)}</td>
                        <td className="px-5 py-3"><ClassificationBadge value={assessment.classification} /></td>
                        <td className="max-w-md px-5 py-3 text-ink-600">{assessment.summary}</td>
                        <td className="px-5 py-3 text-ink-500">{formatDateTime(assessment.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'followups' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Queue a follow-up</CardTitle>
              <CardDescription>
                The database checks consent, sequence status and automation status before creating a job.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="followup-contact">Contact</Label>
                  <Select id="followup-contact" value={contactId} onChange={(event) => setContactId(event.target.value)}>
                    <option value="">Select contact</option>
                    {data.contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>{contactName(contact.id)}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="followup-sequence">Active sequence</Label>
                  <Select id="followup-sequence" value={sequenceId} onChange={(event) => setSequenceId(event.target.value)}>
                    <option value="">Select sequence</option>
                    {data.sequences.filter((sequence) => sequence.status === 'active').map((sequence) => (
                      <option key={sequence.id} value={sequence.id}>{sequence.name} ({sequence.channel})</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="followup-channel">Channel</Label>
                  <Select id="followup-channel" value={followUpChannel} onChange={(event) => setFollowUpChannel(event.target.value)}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                  </Select>
                </div>
              </div>
              <Button onClick={() => void queueFollowUp()}>Queue follow-up</Button>
              <FieldError>{actionError ?? undefined}</FieldError>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sequences and steps</CardTitle>
              <CardDescription>Sequences are read-only here; the database seeds and advances them.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 py-0">
              {data.sequences.length === 0 ? (
                <EmptyState title="No sequences" description="No follow-up sequence exists for this tenant yet." />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {data.sequences.map((sequence) => (
                    <li key={sequence.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ink-900">{sequence.name} <span className="font-normal text-ink-500">({sequence.channel})</span></p>
                        <Badge variant={sequence.status === 'active' ? 'success' : 'neutral'}>{sequence.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {data.steps.filter((step) => step.sequence_id === sequence.id && step.active)
                          .map((step) => `${step.step_index}. ${step.template_key} after ${step.delay_minutes}m`)
                          .join(' · ') || 'No active steps'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Follow-up jobs</CardTitle>
              <CardDescription>{data.jobs.length} recent jobs · provider sends require deployed worker and credentials</CardDescription>
            </CardHeader>
            <CardContent className="px-0 py-0">
              {data.jobs.length === 0 ? (
                <EmptyState title="No jobs" description="Queued follow-ups appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="px-5 py-3">Contact</th>
                        <th className="px-5 py-3">Channel</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Due</th>
                        <th className="px-5 py-3">Attempts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {data.jobs.map((job) => (
                        <tr key={job.id}>
                          <td className="px-5 py-3 font-medium text-ink-900">{contactName(job.contact_id)}</td>
                          <td className="px-5 py-3 text-ink-600">{job.channel}</td>
                          <td className="px-5 py-3"><JobStatusBadge status={job.status} /></td>
                          <td className="px-5 py-3 text-ink-500">{formatDateTime(job.due_at)}</td>
                          <td className="px-5 py-3 text-ink-600">{job.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'consents' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Record consent</CardTitle>
              <CardDescription>Outbound messaging is blocked unless an active opt-in exists.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="consent-contact">Contact</Label>
                  <Select id="consent-contact" value={consentContact} onChange={(event) => setConsentContact(event.target.value)}>
                    <option value="">Select contact</option>
                    {data.contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>{contactName(contact.id)}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="consent-channel">Channel</Label>
                  <Select id="consent-channel" value={consentChannel} onChange={(event) => setConsentChannel(event.target.value)}>
                    {consentChannelOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="consent-status">Status</Label>
                  <Select id="consent-status" value={consentStatus} onChange={(event) => setConsentStatus(event.target.value)}>
                    <option value="opt_in">Opt in</option>
                    <option value="opt_out">Opt out</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="consent-source">Source</Label>
                  <Select id="consent-source" value={consentSource} onChange={(event) => setConsentSource(event.target.value)}>
                    <option value="staff">Staff</option>
                    <option value="manual">Manual</option>
                    <option value="website_chat">Website chat</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="booking">Booking</option>
                    <option value="import">Import</option>
                  </Select>
                </div>
              </div>
              <Button onClick={() => void saveConsent()}>Save consent</Button>
              <FieldError>{consentError ?? undefined}</FieldError>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Consent records</CardTitle>
              <CardDescription>{data.consents.length} records · opt-out is absolute across all outbound channels</CardDescription>
            </CardHeader>
            <CardContent className="px-0 py-0">
              {data.consents.length === 0 ? (
                <EmptyState title="No consent records" description="Consent is recorded by the chatbot, webhook or staff." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="px-5 py-3">Contact</th>
                        <th className="px-5 py-3">Channel</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Source</th>
                        <th className="px-5 py-3">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {data.consents.map((consent) => (
                        <tr key={consent.id}>
                          <td className="px-5 py-3 font-medium text-ink-900">{contactName(consent.contact_id)}</td>
                          <td className="px-5 py-3 text-ink-600">{consent.channel}</td>
                          <td className="px-5 py-3"><ConsentStatusBadge status={consent.status} /></td>
                          <td className="px-5 py-3 text-ink-600">{consent.source}</td>
                          <td className="px-5 py-3 text-ink-500">{formatDateTime(consent.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <HandoffModal
        open={Boolean(handoffConversation)}
        onClose={() => setHandoffConversation(null)}
        tenantId={tenantId ?? ''}
        conversation={handoffConversation}
        members={data.members}
        onSaved={invalidate}
      />
    </div>
  )
}
