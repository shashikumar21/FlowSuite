import { CalendarClock } from 'lucide-react'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { cn } from '@/lib/cn'
import type { BookingSlot } from '@/types/database'
import { formatSlotRange, slotIdentity } from '../utils'

type Props = {
  slots: BookingSlot[]
  timeZone: string
  selectedStart?: string | null
  onSelect: (slot: BookingSlot) => void
  loading?: boolean
  emptyMessage?: string
}

/** Only renders times supplied by the availability RPC — never generated locally. */
export function SlotPicker({
  slots,
  timeZone,
  selectedStart,
  onSelect,
  loading = false,
  emptyMessage = 'No bookable times for this date. Try another day.',
}: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-10" />)}
      </div>
    )
  }

  if (slots.length === 0) {
    return <EmptyState icon={<CalendarClock className="size-5" />} title={emptyMessage} />
  }

  return (
    <div role="radiogroup" aria-label="Available times" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {slots.map((slot) => {
        const selected = slot.start === selectedStart
        return (
          <button
            key={slotIdentity(slot)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(slot)}
            title={formatSlotRange(slot.start, slot.end, timeZone)}
            className={cn(
              'h-10 rounded-lg border text-sm font-semibold transition',
              selected
                ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                : 'border-ink-300 bg-white text-ink-700 hover:border-brand-400 hover:bg-brand-50/50',
            )}
          >
            {formatSlotRange(slot.start, slot.end, timeZone)}
          </button>
        )
      })}
    </div>
  )
}
