import { useEffect, useState } from 'react'
import { Bot, Copy, Plus, ShieldAlert } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Avatar } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime, formatNumber } from '@/lib/format'
import type { AiAgentRow, AiAgentToolRow } from '@/types/database'
import { setAgentStatus, setAgentTool } from '../api'
import { AgentFormModal } from '../components/AgentFormModal'
import { ChatWidget } from '../components/ChatWidget'
import { KnowledgeFormModal } from '../components/KnowledgeFormModal'
import { AgentStatusBadge } from '../components/StatusBadges'
import { useAiAgentsData, useAiConsoleInvalidate, usePublicAgent } from '../hooks'
import { mutatingToolKeys, toolLabels } from '../schemas'
import { buildEmbedSnippet, formatCost, summarizeUsage } from '../utils'

const EMPTY_AGENTS: AiAgentRow[] = []

export function AiAgentsPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const query = useAiAgentsData(tenantId)
  const invalidate = useAiConsoleInvalidate(tenantId)
  const { toast } = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [agentFormOpen, setAgentFormOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AiAgentRow | null>(null)
  const [knowledgeOpen, setKnowledgeOpen] = useState(false)
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const agents = query.data?.agents ?? EMPTY_AGENTS
  const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0] ?? null
  const publicAgentQuery = usePublicAgent(selected?.public_key)

  useEffect(() => {
    if (!selected && agents.length > 0) setSelectedId(agents[0]?.id ?? null)
  }, [agents, selected])

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast({ title: `${label} copied` })
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy the text manually.', variant: 'error' })
    }
  }

  const changeStatus = async (agent: AiAgentRow, status: 'draft' | 'active' | 'paused') => {
    if (!tenantId) return
    setActionError(null)
    try {
      await setAgentStatus(tenantId, agent.id, status)
      invalidate()
      toast({ title: `Agent ${status}`, description: agent.name })
    } catch (cause) {
      setActionError(getErrorMessage(cause))
    }
  }

  const toggleTool = async (tool: AiAgentToolRow, field: 'enabled' | 'requires_confirmation') => {
    if (!tenantId || !selected) return
    setActionError(null)
    try {
      await setAgentTool(
        tenantId,
        selected.id,
        tool.tool_key,
        field === 'enabled' ? !tool.enabled : tool.enabled,
        field === 'requires_confirmation' ? !tool.requires_confirmation : tool.requires_confirmation,
      )
      invalidate()
    } catch (cause) {
      setActionError(getErrorMessage(cause))
    }
  }

  if (query.isError) {
    return (
      <Card><CardContent>
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </CardContent></Card>
    )
  }

  if (query.isLoading || !query.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  const canManage = query.data.canManage
  const tools = query.data.tools.filter((tool) => tool.agent_id === selected?.id)
  const knowledge = query.data.knowledge.filter((entry) => entry.agent_id === selected?.id)
  const usage = query.data.usage.filter((log) => log.agent_id === selected?.id)
  const summary = summarizeUsage(usage)
  const members = query.data.members

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">AI agents</h1>
          <p className="mt-1 text-sm text-ink-500">
            Configure the website assistant, its approved knowledge and the tools it may use. All changes are
            tenant-scoped and recorded in the audit log.
          </p>
        </div>
        <Button
          disabled={!canManage}
          onClick={() => { setEditingAgent(null); setAgentFormOpen(true) }}
        >
          <Plus className="size-4" /> New agent
        </Button>
      </div>

      {!canManage ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <p>Only owners and admins can change AI configuration. You can still review agents and test the widget.</p>
        </div>
      ) : null}

      {actionError ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}

      {agents.length === 0 ? (
        <Card><CardContent>
          <EmptyState
            icon={<Bot className="size-5" />}
            title="No AI agents yet"
            description="Create an agent to enable the website chatbot and WhatsApp replies. The public key is generated by the database."
            action={canManage ? <Button onClick={() => setAgentFormOpen(true)}>Create the first agent</Button> : undefined}
          />
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Agents</CardTitle>
              <CardDescription>{agents.length} in this business</CardDescription>
            </CardHeader>
            <CardContent className="px-2 py-2">
              <ul className="space-y-1">
                {agents.map((agent) => (
                  <li key={agent.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(agent.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                        selected?.id === agent.id ? 'bg-brand-50' : 'hover:bg-ink-50'
                      }`}
                    >
                      <Avatar name={agent.name} className="size-8" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-900">{agent.name}</span>
                        <span className="block text-xs text-ink-500">{agent.language.toUpperCase()} · {agent.tone}</span>
                      </span>
                      <AgentStatusBadge status={agent.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {selected ? (
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{selected.name}</CardTitle>
                    <CardDescription>
                      Updated {formatDateTime(selected.updated_at)} · {selected.response_style} responses
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={!canManage} onClick={() => { setEditingAgent(selected); setAgentFormOpen(true) }}>
                      Edit
                    </Button>
                    {selected.status !== 'active' ? (
                      <Button size="sm" disabled={!canManage} onClick={() => void changeStatus(selected, 'active')}>Activate</Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled={!canManage} onClick={() => void changeStatus(selected, 'paused')}>Pause</Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-ink-50 p-3">
                      <p className="text-xs text-ink-500">Tokens used</p>
                      <p className="text-lg font-semibold text-ink-900">{formatNumber(summary.totalTokens)}</p>
                    </div>
                    <div className="rounded-lg bg-ink-50 p-3">
                      <p className="text-xs text-ink-500">Requests</p>
                      <p className="text-lg font-semibold text-ink-900">{formatNumber(summary.calls)}</p>
                    </div>
                    <div className="rounded-lg bg-ink-50 p-3">
                      <p className="text-xs text-ink-500">Estimated cost</p>
                      <p className="text-lg font-semibold text-ink-900">{formatCost(summary.estimatedCost)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-ink-500">
                    Monthly limit: {selected.monthly_token_limit ? `${formatNumber(selected.monthly_token_limit)} tokens` : 'none set'} ·
                    Last request: {formatDateTime(summary.lastCallAt)} · Failures: {summary.failures}
                  </p>
                  {selected.business_info ? (
                    <p className="whitespace-pre-wrap rounded-lg border border-ink-200 p-3 text-sm text-ink-700">
                      {selected.business_info}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Allowed tools</CardTitle>
                  <CardDescription>
                    Mutating tools require explicit confirmation inside the AI runtime. Booking and CRM writes go through
                    trusted RPCs only.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 py-2">
                  {tools.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-ink-500">No tools are seeded for this agent. Recreate the agent to seed the allowlist.</p>
                  ) : (
                    <ul className="divide-y divide-ink-100">
                      {tools.map((tool) => (
                        <li key={tool.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink-800">
                            <input
                              type="checkbox"
                              checked={tool.enabled}
                              disabled={!canManage}
                              onChange={() => void toggleTool(tool, 'enabled')}
                            />
                            <span className="min-w-0">{toolLabels[tool.tool_key] ?? tool.tool_key}</span>
                          </label>
                          {mutatingToolKeys.has(tool.tool_key) ? (
                            <label className="flex items-center gap-1.5 text-xs text-ink-600">
                              <input
                                type="checkbox"
                                checked={tool.requires_confirmation}
                                disabled={!canManage || !tool.enabled}
                                onChange={() => void toggleTool(tool, 'requires_confirmation')}
                              />
                              Confirm first
                            </label>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle>Approved knowledge</CardTitle>
                    <CardDescription>{knowledge.length} entries · only active approved entries reach the public widget</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" disabled={!canManage} onClick={() => { setEditingKnowledgeId(null); setKnowledgeOpen(true) }}>
                    <Plus className="size-4" /> Add
                  </Button>
                </CardHeader>
                <CardContent className="px-2 py-2">
                  {knowledge.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-ink-500">No knowledge entries yet.</p>
                  ) : (
                    <ul className="divide-y divide-ink-100">
                      {knowledge.map((entry) => (
                        <li key={entry.id} className="flex items-start gap-3 px-3 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink-900">{entry.title}</p>
                            <p className="line-clamp-2 text-xs text-ink-500">{entry.content}</p>
                            <p className="mt-1 text-xs text-ink-400">{entry.category} · {entry.language}</p>
                          </div>
                          <Badge variant={entry.active ? 'success' : 'neutral'}>{entry.active ? 'approved' : 'inactive'}</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canManage}
                            onClick={() => { setEditingKnowledgeId(entry.id); setKnowledgeOpen(true) }}
                          >
                            Edit
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Website chat setup</CardTitle>
                  <CardDescription>The public key identifies the agent. It is not a secret and is safe to embed.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-50 p-2 text-xs text-ink-700">{selected.public_key}</code>
                    <Button size="sm" variant="outline" onClick={() => void copy(selected.public_key, 'Public key')}>
                      <Copy className="size-4" /> Copy key
                    </Button>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink-700">Embed snippet</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void copy(buildEmbedSnippet(selected.public_key), 'Snippet')}
                      >
                        <Copy className="size-4" /> Copy
                      </Button>
                    </div>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-950 p-3 text-xs text-ink-100">
                      {buildEmbedSnippet(selected.public_key)}
                    </pre>
                    <p className="mt-2 text-xs text-ink-500">
                      The widget script and Edge Function must be deployed before this can run on a live site. The preview below
                      calls the configured endpoint directly and will report an error until deployment is approved.
                    </p>
                  </div>
                  <ChatWidget publicKey={selected.public_key} agent={publicAgentQuery.data ?? null} />
                  {publicAgentQuery.isError ? (
                    <p className="text-xs text-red-600">Public config lookup failed: {getErrorMessage(publicAgentQuery.error)}</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      )}

      <AgentFormModal
        open={agentFormOpen}
        onClose={() => setAgentFormOpen(false)}
        tenantId={tenantId ?? ''}
        agent={editingAgent}
        members={members}
        onSaved={invalidate}
      />
      <KnowledgeFormModal
        open={knowledgeOpen}
        onClose={() => setKnowledgeOpen(false)}
        tenantId={tenantId ?? ''}
        agents={agents}
        entry={knowledge.find((item) => item.id === editingKnowledgeId) ?? null}
        defaultAgentId={selected?.id}
        onSaved={invalidate}
      />
    </div>
  )
}
