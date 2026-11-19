import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Label, Select } from '@/components/ui/Input'
import { Plus, Target } from 'lucide-react'
import { fetchContacts, fetchDeals, moveDealStage, type DealWithContact } from '../api'
import { crmKeys, useCrmInvalidate, useCrmOptions } from '../hooks'
import { PipelineBoard } from '../components/PipelineBoard'
import { DealFormModal } from '../components/DealFormModal'
import { DealDetailModal } from '../components/DealDetailModal'
import { stagesForPipeline } from '../utils'
import { getErrorMessage } from '@/lib/errors'

type EmptyOptions = { sources: []; tags: []; pipelines: []; stages: []; members: [] }
const EMPTY_OPTIONS: EmptyOptions = { sources: [], tags: [], pipelines: [], stages: [], members: [] }

export function DealsPage() {
  const { user } = useAuth()
  const { activeTenant, can } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const currency = activeTenant?.businesses?.currency ?? 'INR'
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const invalidate = useCrmInvalidate(tenantId)
  const canManagePipeline = can('manage_pipeline')
  const currentUserId = user?.id ?? ''

  const [pipelineId, setPipelineId] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [newStageId, setNewStageId] = useState<string | undefined>()
  const [selectedDeal, setSelectedDeal] = useState<DealWithContact | null>(null)

  const optionsQuery = useCrmOptions(tenantId)
  const options = optionsQuery.data
  const dealsQuery = useQuery({
    queryKey: crmKeys.deals(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchDeals(tenantId as string),
  })
  const contactsQuery = useQuery({
    queryKey: [...crmKeys.all(tenantId ?? ''), 'deal-contacts'],
    enabled: Boolean(tenantId) && formOpen,
    queryFn: async () => (await fetchContacts(tenantId as string, { limit: 100 })).rows,
  })

  useEffect(() => {
    if (!pipelineId && options?.pipelines[0]) setPipelineId(options.pipelines[0].id)
  }, [options, pipelineId])

  const activeStages = stagesForPipeline(options?.stages ?? [], pipelineId)
  const deals = (dealsQuery.data ?? []).filter((deal) => deal.pipeline_id === pipelineId)

  const onMove = async (dealId: string, stageId: string) => {
    if (!tenantId) return
    const previous = dealsQuery.data
    queryClient.setQueryData<DealWithContact[]>(crmKeys.deals(tenantId), (current) =>
      current?.map((deal) => (deal.id === dealId ? { ...deal, stage_id: stageId } : deal)),
    )
    try {
      await moveDealStage(tenantId, dealId, stageId)
      toast({ title: 'Deal moved' })
      invalidate()
    } catch (error) {
      queryClient.setQueryData(crmKeys.deals(tenantId), previous)
      toast({ title: 'Could not move deal', description: getErrorMessage(error), variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Customers</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Deal pipeline</h1>
          <p className="mt-1 text-sm text-ink-500">
            Drag a card to another stage. You can also open a deal and change its stage with the keyboard.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="pipeline-select">Pipeline</Label>
            <Select
              id="pipeline-select"
              value={pipelineId}
              onChange={(event) => setPipelineId(event.target.value)}
              className="w-48"
            >
              {options?.pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
              ))}
            </Select>
          </div>
          <Button onClick={() => { setNewStageId(activeStages[0]?.id); setFormOpen(true) }} disabled={!pipelineId}>
            <Plus className="size-4" /> New deal
          </Button>
        </div>
      </div>

      {optionsQuery.isError || dealsQuery.isError ? (
        <Card><CardContent><ErrorState
          message="We couldn't load this pipeline."
          onRetry={() => { void optionsQuery.refetch(); void dealsQuery.refetch() }}
        /></CardContent></Card>
      ) : optionsQuery.isLoading || dealsQuery.isLoading ? (
        <Card><CardContent className="space-y-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-24" />)}</CardContent></Card>
      ) : !options?.pipelines.length ? (
        <Card><CardContent>
          <EmptyState
            icon={<Target className="size-5" />}
            title="No pipeline configured"
            description={canManagePipeline ? 'Create a pipeline and its stages in CRM setup to start tracking deals.' : 'Ask a manager to configure the sales pipeline.'}
          />
        </CardContent></Card>
      ) : (
        <PipelineBoard
          deals={deals}
          stages={activeStages}
          members={options?.members ?? []}
          currency={currency}
          disabled={dealsQuery.isFetching}
          onMove={(dealId, stageId) => void onMove(dealId, stageId)}
          onAddDeal={(stageId) => { setNewStageId(stageId); setFormOpen(true) }}
          onDealClick={setSelectedDeal}
        />
      )}

      <DealFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tenantId={tenantId ?? ''}
        options={options ?? EMPTY_OPTIONS}
        contacts={contactsQuery.data ?? []}
        currency={currency}
        currentUserId={currentUserId}
        canAssign={canManagePipeline}
        mode="create"
        initialPipelineId={pipelineId || undefined}
        initialStageId={newStageId}
        onSaved={invalidate}
      />

      <DealDetailModal
        open={Boolean(selectedDeal)}
        onClose={() => setSelectedDeal(null)}
        tenantId={tenantId ?? ''}
        deal={selectedDeal}
        options={options ?? EMPTY_OPTIONS}
        currency={currency}
        canManagePipeline={canManagePipeline}
        onChanged={invalidate}
      />
    </div>
  )
}
