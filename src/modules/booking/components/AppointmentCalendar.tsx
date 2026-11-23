import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { cn } from '@/lib/cn'
import type { AppointmentRow } from '@/types/database'
import { AppointmentStatusBadge } from './StatusBadge'
import {
  formatDateLabel,
  formatSlotTime,
  groupAppointmentsByDate,
  monthGrid,
  monthKeyFromDate,
  monthLabel,
  shiftMonth,
  todayInZone,
} from '../utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

type Props = {
  appointments: AppointmentRow[]
  timeZone: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

/** Read-only month view of FlowSuite appointments in the business timezone. */
export function AppointmentCalendar({ appointments, timeZone, loading = false, error = null, onRetry }: Props) {
  const today = todayInZone(timeZone)
  const [month, setMonth] = useState(() => monthKeyFromDate(today) || '1970-01')
  const [selectedDate, setSelectedDate] = useState(() => today || '1970-01-01')

  const days = useMemo(() => monthGrid(month), [month])
  const grouped = useMemo(() => groupAppointmentsByDate(appointments, timeZone), [appointments, timeZone])
  const monthCount = days.reduce(
    (total, date) => total + (date.startsWith(month) ? (grouped.get(date)?.length ?? 0) : 0),
    0,
  )
  const selectedRows = grouped.get(selectedDate) ?? []

  const goToDay = (date: string) => {
    setSelectedDate(date)
    const nextMonth = monthKeyFromDate(date)
    if (nextMonth && nextMonth !== month) setMonth(nextMonth)
  }

  const goToday = () => {
    if (!today) return
    setSelectedDate(today)
    setMonth(monthKeyFromDate(today))
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold text-ink-900">Appointment calendar</h2>
              <p className="text-xs text-ink-500">
                {loading ? 'Loading…' : `${monthCount} appointment${monthCount === 1 ? '' : 's'} · times in ${timeZone}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
            <Button variant="outline" size="sm" className="px-2" aria-label="Previous month" onClick={() => setMonth((value) => shiftMonth(value, -1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="px-2" aria-label="Next month" onClick={() => setMonth((value) => shiftMonth(value, 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <p className="text-sm font-semibold text-ink-800">{monthLabel(month)}</p>

        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : loading ? (
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 14 }, (_, index) => <Skeleton key={index} className="h-16" />)}
          </div>
        ) : monthCount === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-5" />}
            title="No appointments this month"
            description="Appointments created in FlowSuite appear here automatically."
            action={<Button size="sm" variant="outline" onClick={goToday}>Go to today</Button>}
          />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-px">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-500">
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200">
              {days.map((date) => {
                const rows = grouped.get(date) ?? []
                const isCurrentMonth = date.startsWith(month)
                const isToday = date === today
                const isSelected = date === selectedDate
                return (
                  <button
                    key={date}
                    type="button"
                    aria-label={`${formatDateLabel(date)}, ${rows.length} appointment${rows.length === 1 ? '' : 's'}`}
                    aria-pressed={isSelected}
                    onClick={() => goToDay(date)}
                    className={cn(
                      'min-h-24 bg-white p-2 text-left align-top transition hover:bg-brand-50/60',
                      !isCurrentMonth && 'bg-ink-50 text-ink-400',
                      isSelected && 'ring-2 ring-inset ring-brand-500',
                    )}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                          isToday ? 'bg-brand-600 text-white' : 'text-ink-700',
                        )}
                      >
                        {Number(date.slice(-2))}
                      </span>
                      {rows.length > 0 ? <span className="text-[10px] font-semibold text-brand-600">{rows.length}</span> : null}
                    </span>
                    <span className="mt-1 block space-y-1">
                      {rows.slice(0, 2).map((row) => (
                        <span
                          key={row.id}
                          title={`${formatSlotTime(row.start_at, timeZone)} · ${row.customer_name ?? row.title}`}
                          className="block truncate rounded bg-brand-50 px-1 py-0.5 text-[10px] font-medium text-brand-800"
                        >
                          {formatSlotTime(row.start_at, timeZone)} {row.customer_name ?? row.title}
                        </span>
                      ))}
                      {rows.length > 2 ? <span className="block text-[10px] text-ink-500">+{rows.length - 2} more</span> : null}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="overflow-hidden rounded-lg border border-ink-200">
              <div className="flex items-center justify-between gap-3 border-b border-ink-200 bg-ink-50 px-4 py-3">
                <p className="text-sm font-semibold text-ink-900">{formatDateLabel(selectedDate)}</p>
                <p className="text-xs text-ink-500">{selectedRows.length} appointment{selectedRows.length === 1 ? '' : 's'}</p>
              </div>
              {selectedRows.length === 0 ? (
                <EmptyState title="No appointments on this day" description="Pick another date in the grid." />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {selectedRows.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-900">
                          {formatSlotTime(row.start_at, timeZone)} · {row.customer_name ?? row.title}
                        </p>
                        <p className="truncate text-xs text-ink-500">{row.title}{row.notes ? ` · ${row.notes}` : ''}</p>
                      </div>
                      <AppointmentStatusBadge status={row.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
