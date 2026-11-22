import { useState } from 'react'
import { Building2, Pencil, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import type { DecisionMakerRow, Json } from '@/types/database'
import { DecisionMakerFormModal } from '../components/DecisionMakerFormModal'
import { SignalFormModal } from '../components/SignalFormModal'
import { VerificationModal } from '../components/VerificationModal'
import {
  useDecisionMakers,
  useDeleteDecisionMaker,
  useDeleteSignal,
  useProspectOptions,
  useSignals,
  useVerifications,
} from '../hooks'
import { canManageContacts, signalLabel, verificationLabel } from '../utils'
import { formatDate } from '@/lib/format'
import type { ProspectOption } from '../api'

type VerificationTarget = { entityType: 'prospect' | 'decision_maker'; entityId: string; label: string } | null

function evidenceNote(evidence: Json): string {
  if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
    const note = (evidence as Record<string, unknown>).note
    return typeof note === 'string' ? note : ''
  }
  return ''
}

function badgeVariant(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'verified') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'invalid') return 'danger'
  return 'neutral'
}

export function DecisionMakersPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const canManage = canManageContacts(activeTenant?.role)
  const { toast } = useToast()

  const prospectsQuery = useProspectOptions(tenantId)
  const dmsQuery = useDecisionMakers(tenantId)
  const verificationsQuery = useVerifications(tenantId)
  const signalsQuery = useSignals(tenantId)
  const deleteDm = useDeleteDecisionMaker(tenantId)
  const deleteSignal = useDeleteSignal(tenantId)

  const [dmOpen, setDmOpen] = useState(false)
  const [editing, setEditing] = useState<DecisionMakerRow | null>(null)
  const [signalOpen, setSignalOpen] = useState(false)
  const [verify, setVerify] = useState<VerificationTarget>(null)

  if (!tenantId) return <ErrorState message="Select a business to manage its decision makers." />

  const prospects: ProspectOption[] = prospectsQuery.data ?? []
  const decisionMakers = dmsQuery.data ?? []
  const verifications = verificationsQuery.data ?? []
  const signals = signalsQuery.data ?? []
  const prospectNames = new Map(prospects.map((item) => [item.id, item.business_name]))

  const grouped = prospects
    .map((prospect) => ({
      prospect,
      people: decisionMakers.filter((person) => person.prospect_id === prospect.id),
    }))
    .filter((group) => group.people.length > 0)

  const isLoading = prospectsQuery.isLoading || dmsQuery.isLoading || verificationsQuery.isLoading || signalsQuery.isLoading
  const error = prospectsQuery.error ?? dmsQuery.error ?? verificationsQuery.error ?? signalsQuery.error
  const refetch = () => {
    void prospectsQuery.refetch()
    void dmsQuery.refetch()
    void verificationsQuery.refetch()
    void signalsQuery.refetch()
  }

  async function handleDeleteDm(person: DecisionMakerRow) {
    if (!canManage || !window.confirm(`Delete ${person.full_name}? This cannot be undone.`)) return
    try {
      await deleteDm.mutateAsync(person.id)
      toast({ title: 'Decision maker deleted' })
    } catch (error) {
      toast({ title: 'Could not delete decision maker', description: getErrorMessage(error), variant: 'error' })
    }
  }

  async function handleDeleteSignal(id: string) {
    if (!canManage || !window.confirm('Delete this research signal?')) return
    try {
      await deleteSignal.mutateAsync(id)
      toast({ title: 'Signal deleted' })
    } catch (error) {
      toast({ title: 'Could not delete signal', description: getErrorMessage(error), variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Decision makers</h1>
          <p className="mt-1 text-sm text-ink-500">
            People inside each prospect. Verification is recorded by a person, never claimed by a provider.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setSignalOpen(true)} disabled={prospects.length === 0}>
            <Plus className="size-4" /> Add signal
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDmOpen(true) }} disabled={prospects.length === 0}>
            <UserCog className="size-4" /> Add decision maker
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      ) : error ? (
        <ErrorState message={getErrorMessage(error)} onRetry={refetch} />
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserCog className="size-5" />}
            title="No decision makers yet"
            description={prospects.length === 0 ? 'Add a prospect first, then record the people you found.' : 'Record a person inside one of your prospects.'}
            action={prospects.length === 0 ? (
              <Link to="/app/sales-agent/prospects" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                Go to prospects
              </Link>
            ) : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ prospect, people }) => (
            <Card key={prospect.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-ink-400" />
                  <CardTitle>{prospect.business_name}</CardTitle>
                  <Badge variant="neutral">{people.length}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVerify({ entityType: 'prospect', entityId: prospect.id, label: prospect.business_name })}
                >
                  <ShieldCheck className="size-4" /> Verify prospect
                </Button>
              </CardHeader>
              <CardContent className="divide-y divide-ink-100 p-0">
                {people.map((person) => (
                  <div key={person.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">
                        {person.full_name}{person.job_title ? <span className="font-normal text-ink-500"> · {person.job_title}</span> : null}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {[person.email, person.phone].filter(Boolean).join(' · ') || 'No contact details'}
                      </p>
                    </div>
                    <Badge variant={badgeVariant(person.verification_status)}>{verificationLabel(person.verification_status)}</Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVerify({ entityType: 'decision_maker', entityId: person.id, label: person.full_name })}
                      >
                        <ShieldCheck className="size-4" /> Verify
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditing(person); setDmOpen(true) }}
                        aria-label={`Edit ${person.full_name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeleteDm(person)}
                          aria-label={`Delete ${person.full_name}`}
                        >
                          <Trash2 className="size-4 text-red-600" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Research signals</CardTitle>
            <CardDescription>Notes recorded by your team. No provider is connected.</CardDescription>
          </CardHeader>
          <CardContent>
            {signalsQuery.isError ? (
              <p className="text-sm text-red-700">{getErrorMessage(signalsQuery.error)}</p>
            ) : signals.length === 0 ? (
              <p className="text-sm text-ink-500">No signals recorded yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {signals.slice(0, 25).map((signal) => (
                  <li key={signal.id} className="flex items-start gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-900">
                        <Badge variant="neutral" className="mr-2">{signalLabel(signal.signal_type)}</Badge>
                        {signal.summary}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {prospectNames.get(signal.prospect_id) ?? 'Unknown prospect'} · {formatDate(signal.created_at)}
                        {signal.source_url ? ` · ${signal.source_url}` : ''}
                      </p>
                    </div>
                    {canManage ? (
                      <Button variant="ghost" size="sm" onClick={() => void handleDeleteSignal(signal.id)} aria-label="Delete signal">
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verification history</CardTitle>
            <CardDescription>Append-only. A result of “verified” always names the person who attested.</CardDescription>
          </CardHeader>
          <CardContent>
            {verificationsQuery.isError ? (
              <p className="text-sm text-red-700">{getErrorMessage(verificationsQuery.error)}</p>
            ) : verifications.length === 0 ? (
              <p className="text-sm text-ink-500">No verifications recorded yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {verifications.slice(0, 25).map((item) => (
                  <li key={item.id} className="flex items-start gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-900">
                        <Badge variant={badgeVariant(item.status)} className="mr-2">{verificationLabel(item.status)}</Badge>
                        {item.entity_type === 'prospect'
                          ? prospectNames.get(item.entity_id) ?? 'Prospect'
                          : decisionMakers.find((person) => person.id === item.entity_id)?.full_name ?? 'Decision maker'}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {item.method === 'manual' ? 'Manually checked' : item.provider ?? 'Provider'} · {formatDate(item.checked_at)}
                      </p>
                      {evidenceNote(item.evidence) ? (
                        <p className="mt-1 text-xs italic text-ink-600">“{evidenceNote(item.evidence)}”</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {dmOpen ? (
        <DecisionMakerFormModal
          key={editing?.id ?? 'new'}
          open
          onClose={() => { setDmOpen(false); setEditing(null) }}
          tenantId={tenantId}
          prospects={prospects}
          initial={editing}
          onSaved={refetch}
        />
      ) : null}

      {signalOpen ? (
        <SignalFormModal
          key="signal"
          open
          onClose={() => setSignalOpen(false)}
          tenantId={tenantId}
          prospects={prospects}
          onSaved={refetch}
        />
      ) : null}

      {verify ? (
        <VerificationModal
          key={`${verify.entityType}:${verify.entityId}`}
          open
          onClose={() => setVerify(null)}
          tenantId={tenantId}
          entityType={verify.entityType}
          entityId={verify.entityId}
          label={verify.label}
          onSaved={refetch}
        />
      ) : null}
    </div>
  )
}
