import { useState, type CSSProperties } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { GripVertical, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/format'
import type { DealWithContact, MemberOption } from '../api'
import { DEAL_NODE_PREFIX, STAGE_NODE_PREFIX, groupDealsByStage, resolveDropTarget } from '../utils'
import type { StageRow } from '@/types/database'

type Props = {
  deals: DealWithContact[]
  stages: StageRow[]
  members: MemberOption[]
  currency: string
  disabled?: boolean
  onMove: (dealId: string, stageId: string) => void
  onAddDeal: (stageId: string) => void
  onDealClick: (deal: DealWithContact) => void
}

export function PipelineBoard({ deals, stages, members, currency, disabled = false, onMove, onAddDeal, onDealClick }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const grouped = groupDealsByStage(
    deals,
    stages.map((stage) => stage.id),
  )

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    if (disabled || !event.over) return
    const active = String(event.active.id)
    if (!active.startsWith(DEAL_NODE_PREFIX)) return
    const dealId = active.slice(DEAL_NODE_PREFIX.length)
    const targetStageId = resolveDropTarget(String(event.over.id), deals)
    const deal = deals.find((item) => item.id === dealId)
    if (!targetStageId || !deal || deal.stage_id === targetStageId) return
    onMove(dealId, targetStageId)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event) => setActiveId(String(event.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            deals={grouped[stage.id] ?? []}
            members={members}
            currency={currency}
            activeId={activeId}
            disabled={disabled}
            onAddDeal={onAddDeal}
            onDealClick={onDealClick}
          />
        ))}
        {stages.length === 0 ? (
          <p className="w-full rounded-xl border border-dashed border-ink-300 px-5 py-10 text-center text-sm text-ink-500">
            No stages yet. A manager can add them from CRM setup.
          </p>
        ) : null}
      </div>
    </DndContext>
  )
}

function StageColumn({
  stage,
  deals,
  members,
  currency,
  activeId,
  disabled,
  onAddDeal,
  onDealClick,
}: {
  stage: StageRow
  deals: DealWithContact[]
  members: MemberOption[]
  currency: string
  activeId: string | null
  disabled: boolean
  onAddDeal: (stageId: string) => void
  onDealClick: (deal: DealWithContact) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${STAGE_NODE_PREFIX}${stage.id}`, disabled })
  const total = deals.reduce((sum, deal) => sum + Number(deal.value), 0)

  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.name} stage`}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border bg-ink-50/70 p-3 transition',
        isOver ? 'border-brand-400 bg-brand-50/60 ring-2 ring-brand-500/20' : 'border-ink-200',
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color ?? '#6366f1' }} />
            <h3 className="truncate text-sm font-semibold text-ink-900">{stage.name}</h3>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {deals.length} {deals.length === 1 ? 'deal' : 'deals'} · {formatCurrency(total, currency)}
          </p>
        </div>
        {stage.is_won ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">WON</span> : null}
        {stage.is_closed && !stage.is_won ? (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">LOST</span>
        ) : null}
      </header>

      <SortableContext
        items={deals.map((deal) => `${DEAL_NODE_PREFIX}${deal.id}`)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <div className="min-h-24 space-y-2">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              members={members}
              currency={currency}
              faded={activeId === `${DEAL_NODE_PREFIX}${deal.id}`}
              onClick={() => onDealClick(deal)}
            />
          ))}
          {deals.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-300 px-3 py-5 text-center text-xs text-ink-400">
              Drop a deal here
            </p>
          ) : null}
        </div>
      </SortableContext>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onAddDeal(stage.id)}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-300 py-2 text-xs font-semibold text-ink-500 transition hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
      >
        <Plus className="size-3.5" /> Add deal
      </button>
    </section>
  )
}

function DealCard({
  deal,
  members,
  currency,
  faded,
  onClick,
}: {
  deal: DealWithContact
  members: MemberOption[]
  currency: string
  faded: boolean
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${DEAL_NODE_PREFIX}${deal.id}`,
  })
  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  }
  const contactName = deal.contacts
    ? `${deal.contacts.first_name} ${deal.contacts.last_name ?? ''}`.trim()
    : 'Unknown contact'
  const assignee = members.find((member) => member.user_id === deal.assigned_to)

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border border-ink-200 bg-white p-3 shadow-xs',
        isDragging && 'z-10 shadow-popover',
        faded && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${deal.title}`}
          className="-ml-1 shrink-0 cursor-grab rounded p-0.5 text-ink-400 hover:bg-ink-100 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold text-ink-900">{deal.title}</p>
          <p className="mt-0.5 truncate text-xs text-ink-500">{contactName}</p>
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink-900">{formatCurrency(Number(deal.value), currency)}</span>
        <span className="truncate text-[11px] text-ink-500">
          {assignee ? (assignee.full_name ?? assignee.user_id) : 'Unassigned'}
        </span>
      </div>
    </article>
  )
}
