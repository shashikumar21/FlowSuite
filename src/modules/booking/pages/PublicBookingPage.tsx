import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { CalendarCheck2, CalendarClock, CalendarX2, CheckCircle2, Globe2, Info, RefreshCw } from 'lucide-react'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Input, Label, Textarea } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { getErrorMessage } from '@/lib/errors'
import type { AppointmentStatus, BookingSlot, PublicBookingPage as PublicPageConfig } from '@/types/database'
import { createPublicBooking, fetchPublicBookingPage, fetchPublicSlots, managePublicBooking } from '../api'
import { FormError } from '../components/FormError'
import { SlotPicker } from '../components/SlotPicker'
import {
  makePublicBookingSchema,
  rescheduleSchema,
  type PublicBookingFormValues,
  type RescheduleFormValues,
} from '../schemas'
import {
  bookingDateOptions,
  calendarDateInZone,
  createIdempotencyKey,
  formatDateLabel,
  formatLeadTime,
  formatPrice,
  formatSlotDateTime,
  resolveTimeZone,
  todayInZone,
} from '../utils'

type Confirmation = {
  id: string
  manageToken: string
  status: AppointmentStatus | 'existing'
  startAt: string
  serviceName: string
  customerName: string
}

type FlowProps = {
  slug: string
  page: PublicPageConfig
}

function managementKey(slug: string) {
  return `flowsuite:booking-manage:${slug}`
}

/** Tokens stay in memory and this browser's session storage — never in a URL. */
function readConfirmation(slug: string): Confirmation | null {
  try {
    const raw = window.sessionStorage.getItem(managementKey(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Confirmation
    if (!parsed || typeof parsed.manageToken !== 'string' || typeof parsed.startAt !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function saveConfirmation(slug: string, value: Confirmation | null) {
  try {
    if (value) window.sessionStorage.setItem(managementKey(slug), JSON.stringify(value))
    else window.sessionStorage.removeItem(managementKey(slug))
  } catch {
    // Session storage can be disabled; the in-memory state still works.
  }
}

function PublicShell({ children, page }: { children: React.ReactNode; page?: PublicPageConfig | null }) {
  const accent = page?.primary_color ?? '#4f46e5'
  return (
    <div className="min-h-screen bg-ink-50" style={{ accentColor: accent }}>
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {page?.logo_url ? (
            <img src={page.logo_url} alt={`${page.business_name} logo`} className="h-10 w-auto max-w-32 object-contain" />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-lg" style={{ backgroundColor: accent }}>
              <CalendarCheck2 className="size-5 text-white" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-900">{page?.business_name ?? 'Online booking'}</p>
            <p className="text-xs text-ink-500">Appointment booking</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  )
}

/** All state and hooks stay mounted so slot selection survives confirmation updates. */
function BookingFlow({ slug, page }: FlowProps) {
  const { toast } = useToast()
  const timeZone = resolveTimeZone(page.business_timezone)
  const dates = useMemo(
    () => bookingDateOptions(timeZone, page.booking_horizon_days),
    [timeZone, page.booking_horizon_days],
  )

  const [confirmation, setConfirmation] = useState<Confirmation | null>(() => readConfirmation(slug))
  const [serviceId, setServiceId] = useState(page.services[0]?.id ?? '')
  const [dateOffset, setDateOffset] = useState(0)
  const [date, setDate] = useState(() => todayInZone(timeZone))
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)

  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState(() => todayInZone(timeZone))
  const [rescheduleOffset, setRescheduleOffset] = useState(0)
  const [rescheduleSlot, setRescheduleSlot] = useState<BookingSlot | null>(null)
  const [actionError, setActionError] = useState('')
  const [working, setWorking] = useState<'book' | 'cancel' | 'reschedule' | null>(null)

  const publicSchema = useMemo(
    () => makePublicBookingSchema({ requireEmail: page.require_email, requirePhone: page.require_phone }),
    [page.require_email, page.require_phone],
  )
  const form = useForm<PublicBookingFormValues>({
    resolver: zodResolver(publicSchema),
    defaultValues: { customer_name: '', customer_phone: '', customer_email: '', notes: '' },
  })
  const rescheduleForm = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: { date: '', start_at: '', reason: '' },
  })

  const selectedService = page.services.find((service) => service.id === serviceId) ?? null
  const accent = page.primary_color ?? '#4f46e5'

  useEffect(() => {
    if (dates.length > 0 && !dates.includes(date)) setDate(dates[0] as string)
  }, [dates, date])

  const slotsQuery = useQuery({
    queryKey: ['booking', 'public', slug, 'slots', serviceId, date],
    enabled: Boolean(!confirmation && slug && serviceId && date),
    queryFn: () => fetchPublicSlots(slug, serviceId, date),
  })

  const rescheduleSlotsQuery = useQuery({
    queryKey: ['booking', 'public', slug, 'reschedule-slots', serviceId, rescheduleDate],
    enabled: Boolean(confirmation && rescheduleOpen && slug && serviceId && rescheduleDate),
    queryFn: () => fetchPublicSlots(slug, serviceId, rescheduleDate),
  })

  useEffect(() => {
    if (!rescheduleOpen) return
    rescheduleForm.setValue('date', rescheduleDate)
    rescheduleForm.setValue('start_at', '')
    rescheduleForm.clearErrors('start_at')
    rescheduleForm.clearErrors('root')
  }, [rescheduleDate, rescheduleOpen, rescheduleForm])

  const applyConfirmation = (next: Confirmation, message: string) => {
    setConfirmation(next)
    saveConfirmation(slug, next)
    toast({ title: message })
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!selectedSlot) {
      form.setError('root', { message: 'Choose an available time before continuing.' })
      return
    }
    setWorking('book')
    form.setError('root', { message: '' })
    try {
      const result = await createPublicBooking({
        slug,
        service_id: serviceId,
        start_at: selectedSlot.start,
        customer_name: values.customer_name,
        customer_phone: values.customer_phone,
        customer_email: values.customer_email,
        notes: values.notes,
        idempotency_key: idempotencyKey,
      })
      const status = String(result.status)
      const next: Confirmation = {
        id: result.id,
        manageToken: result.manage_token,
        status: status === 'existing' ? 'existing' : result.status,
        startAt: result.start_at || selectedSlot.start,
        serviceName: result.service_name || selectedService?.name || 'Appointment',
        customerName: values.customer_name,
      }
      applyConfirmation(
        next,
        status === 'existing' ? 'You already have this booking' : 'Booking request sent',
      )
      setRescheduleOpen(false)
      setActionError('')
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error) })
      void slotsQuery.refetch()
    } finally {
      setWorking(null)
    }
  })

  const handleCancel = async () => {
    if (!confirmation || working) return
    setWorking('cancel')
    setActionError('')
    try {
      const result = await managePublicBooking({ token: confirmation.manageToken, action: 'cancel' })
      applyConfirmation({ ...confirmation, status: result.status }, 'Booking cancelled')
      setRescheduleOpen(false)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setWorking(null)
    }
  }

  const onReschedule = rescheduleForm.handleSubmit(async (values) => {
    if (!confirmation || working) return
    if (!values.start_at) {
      rescheduleForm.setError('start_at', { message: 'Choose an available time' })
      return
    }
    setWorking('reschedule')
    setActionError('')
    try {
      const result = await managePublicBooking({
        token: confirmation.manageToken,
        action: 'reschedule',
        startAt: values.start_at,
        reason: values.reason || undefined,
      })
      applyConfirmation(
        { ...confirmation, status: result.status, startAt: result.start_at ?? values.start_at },
        'Booking rescheduled',
      )
      setRescheduleOpen(false)
      setRescheduleSlot(null)
    } catch (error) {
      const message = getErrorMessage(error)
      setActionError(message)
      rescheduleForm.setError('root', { message })
      void rescheduleSlotsQuery.refetch()
    } finally {
      setWorking(null)
    }
  })

  const startNewBooking = () => {
    saveConfirmation(slug, null)
    setConfirmation(null)
    setSelectedSlot(null)
    setServiceId(page.services[0]?.id ?? '')
    setDate(todayInZone(timeZone))
    setDateOffset(0)
    setRescheduleOpen(false)
    setRescheduleSlot(null)
    setActionError('')
    setIdempotencyKey(createIdempotencyKey())
    form.reset({ customer_name: '', customer_phone: '', customer_email: '', notes: '' })
  }

  if (confirmation) {
    const cancelled = confirmation.status === 'cancelled'
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Your booking</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            {cancelled ? 'Booking cancelled' : confirmation.status === 'existing' ? 'Booking already confirmed' : 'Request received'}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            We saved your booking details in this browser so you can manage it without a link.
          </p>
        </div>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{confirmation.serviceName}</CardTitle>
              <CardDescription>For {confirmation.customerName}</CardDescription>
            </div>
            <Badge variant={cancelled ? 'neutral' : 'success'}>
              {cancelled ? 'Cancelled' : confirmation.status === 'existing' ? 'Already booked' : 'Pending confirmation'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-ink-50 p-3 text-sm text-ink-800">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <span>{formatSlotDateTime(confirmation.startAt, timeZone)} ({timeZone})</span>
            </div>
            <p className="text-xs text-ink-500">Reference: {confirmation.id.slice(0, 8).toUpperCase()}</p>
            {confirmation.status === 'existing' ? (
              <p className="flex items-start gap-2 text-sm text-ink-600">
                <Info className="mt-0.5 size-4 shrink-0" />
                This request was already submitted — no duplicate booking was created.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {cancelled ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={<CalendarX2 className="size-5" />}
                title="This booking is no longer active"
                description="You can make a fresh booking below."
                action={<Button size="sm" onClick={startNewBooking}>Book again</Button>}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Manage your booking</CardTitle>
              <CardDescription>
                Changes may be restricted close to the appointment time. The business will confirm any change.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormError message={actionError} />

              <div className="flex flex-wrap gap-2">
                {page.allow_rescheduling ? (
                  <Button
                    variant="outline"
                    disabled={Boolean(working)}
                    onClick={() => {
                      const currentDate = calendarDateInZone(confirmation.startAt, timeZone) || (dates[0] ?? '')
                      setRescheduleDate(currentDate)
                      setRescheduleOffset(Math.max(0, dates.indexOf(currentDate) - 3))
                      setRescheduleSlot(null)
                      setActionError('')
                      rescheduleForm.reset({ date: currentDate, start_at: '', reason: '' })
                      setRescheduleOpen((open) => !open)
                    }}
                  >
                    <RefreshCw className="size-4" /> Change time
                  </Button>
                ) : null}
                {page.allow_cancellation ? (
                  <Button variant="danger" loading={working === 'cancel'} onClick={() => { void handleCancel() }}>
                    <CalendarX2 className="size-4" /> Cancel booking
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={startNewBooking}>Book another</Button>
              </div>

              {!page.allow_cancellation && !page.allow_rescheduling ? (
                <p className="text-sm text-ink-500">
                  This booking cannot be changed online. Please contact {page.business_name} directly.
                </p>
              ) : null}

              {rescheduleOpen && page.allow_rescheduling ? (
                <form onSubmit={onReschedule} className="space-y-4 border-t border-ink-100 pt-4" noValidate>
                  <input type="hidden" {...rescheduleForm.register('date')} />
                  <input type="hidden" {...rescheduleForm.register('start_at')} />
                  <div>
                    <Label>Choose a new date ({timeZone})</Label>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
                      {dates.slice(rescheduleOffset, rescheduleOffset + 7).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setRescheduleDate(option)
                            setRescheduleSlot(null)
                          }}
                          className={cn(
                            'shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold',
                            option === rescheduleDate
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50',
                          )}
                        >
                          {formatDateLabel(option)}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-3 text-xs font-semibold text-brand-600">
                      <button
                        type="button"
                        disabled={rescheduleOffset === 0}
                        onClick={() => setRescheduleOffset((offset) => Math.max(0, offset - 7))}
                      >
                        ← Earlier
                      </button>
                      <button
                        type="button"
                        disabled={rescheduleOffset + 7 >= dates.length}
                        onClick={() => setRescheduleOffset((offset) => Math.min(dates.length - 1, offset + 7))}
                      >
                        Later →
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label>Available times</Label>
                    {rescheduleSlotsQuery.isError ? (
                      <p className="text-sm text-red-600">{getErrorMessage(rescheduleSlotsQuery.error)}</p>
                    ) : (
                      <SlotPicker
                        slots={(rescheduleSlotsQuery.data ?? []).filter((slot) => slot.start !== confirmation.startAt)}
                        timeZone={timeZone}
                        selectedStart={rescheduleSlot?.start ?? rescheduleForm.watch('start_at')}
                        loading={rescheduleSlotsQuery.isLoading}
                        onSelect={(slot) => {
                          setRescheduleSlot(slot)
                          rescheduleForm.setValue('start_at', slot.start, { shouldValidate: true })
                          rescheduleForm.clearErrors('start_at')
                          rescheduleForm.clearErrors('root')
                          setActionError('')
                        }}
                      />
                    )}
                    <FieldError>{rescheduleForm.formState.errors.start_at?.message}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="reschedule-reason">Reason (optional)</Label>
                    <Textarea id="reschedule-reason" {...rescheduleForm.register('reason')} />
                  </div>
                  <FormError message={rescheduleForm.formState.errors.root?.message} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" loading={rescheduleForm.formState.isSubmitting || working === 'reschedule'}>
                      Confirm new time
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setRescheduleOpen(false)}>Keep current time</Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">{page.business_name}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{page.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-500">
          {page.description ?? `Choose a service and a time that suits you. Times are shown in ${timeZone}.`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Choose a service</CardTitle>
          <CardDescription>Duration and price are set by {page.business_name}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {page.services.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => {
                setServiceId(service.id)
                setSelectedSlot(null)
                form.clearErrors('root')
              }}
              className={cn(
                'rounded-lg border p-4 text-left transition',
                service.id === serviceId
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                  : 'border-ink-200 bg-white hover:border-brand-400',
              )}
            >
              <p className="text-sm font-semibold text-ink-900">{service.name}</p>
              <p className="mt-1 text-xs text-ink-500">{service.duration_minutes} min · {formatPrice(service.price, service.currency)}</p>
              {service.description ? <p className="mt-2 line-clamp-2 text-xs text-ink-500">{service.description}</p> : null}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-end justify-between gap-3">
          <div>
            <CardTitle>2. Pick a date &amp; time</CardTitle>
            <CardDescription>
              Times are in {timeZone}. {formatLeadTime(page.lead_time_minutes)}.
            </CardDescription>
          </div>
          <div className="flex gap-3 text-xs font-semibold text-brand-600">
            <button type="button" disabled={dateOffset === 0} onClick={() => setDateOffset((offset) => Math.max(0, offset - 7))}>
              ← Earlier
            </button>
            <button
              type="button"
              disabled={dateOffset + 7 >= dates.length}
              onClick={() => setDateOffset((offset) => Math.min(dates.length - 1, offset + 7))}
            >
              Later →
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {dates.slice(dateOffset, dateOffset + 7).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setDate(option)
                  setSelectedSlot(null)
                }}
                className={cn(
                  'shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold',
                  option === date
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50',
                )}
              >
                {formatDateLabel(option)}
              </button>
            ))}
          </div>

          {slotsQuery.isError ? (
            <ErrorState
              message={`We couldn't load available times. ${getErrorMessage(slotsQuery.error)}`}
              onRetry={() => { void slotsQuery.refetch() }}
            />
          ) : (
            <SlotPicker
              slots={slotsQuery.data ?? []}
              timeZone={timeZone}
              selectedStart={selectedSlot?.start ?? null}
              loading={slotsQuery.isLoading}
              onSelect={(slot) => {
                setSelectedSlot(slot)
                form.clearErrors('root')
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Your details</CardTitle>
          <CardDescription>
            {selectedService ? `${selectedService.name} · ${formatPrice(selectedService.price, selectedService.currency)}` : 'We will confirm your appointment after you submit.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormError message={form.formState.errors.root?.message} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="public-name">Full name</Label>
                <Input id="public-name" autoComplete="name" {...form.register('customer_name')} />
                <FieldError>{form.formState.errors.customer_name?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="public-phone">Phone {page.require_phone ? '*' : '(optional)'}</Label>
                <Input id="public-phone" type="tel" autoComplete="tel" {...form.register('customer_phone')} />
                <FieldError>{form.formState.errors.customer_phone?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="public-email">Email {page.require_email ? '*' : '(optional)'}</Label>
                <Input id="public-email" type="email" autoComplete="email" {...form.register('customer_email')} />
                <FieldError>{form.formState.errors.customer_email?.message}</FieldError>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="public-notes">Anything we should know? (optional)</Label>
                <Textarea id="public-notes" {...form.register('notes')} />
                <FieldError>{form.formState.errors.notes?.message}</FieldError>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <span>
                {selectedSlot
                  ? `Selected: ${formatSlotDateTime(selectedSlot.start, timeZone)}. The time is re-checked when you submit.`
                  : 'Select an available time above before submitting.'}
              </span>
            </div>
            <Button type="submit" className="w-full sm:w-auto" style={{ backgroundColor: accent }} loading={working === 'book'}>
              Request booking
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-ink-400">
        Powered by {page.business_name} · All times shown in {timeZone}
      </p>
    </div>
  )
}

export function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>()
  const pageQuery = useQuery({
    queryKey: ['booking', 'public', slug ?? '', 'page'],
    enabled: Boolean(slug),
    queryFn: () => fetchPublicBookingPage(slug as string),
  })

  if (!slug || pageQuery.isLoading) {
    return (
      <PublicShell>
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Card><CardContent className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></CardContent></Card>
          <Card><CardContent className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></CardContent></Card>
        </div>
      </PublicShell>
    )
  }

  if (pageQuery.isError) {
    return (
      <PublicShell>
        <Card>
          <ErrorState
            message="We couldn't open this booking page right now. Please try again shortly."
            onRetry={() => { void pageQuery.refetch() }}
          />
        </Card>
      </PublicShell>
    )
  }

  const page = pageQuery.data
  if (!page || page.services.length === 0) {
    return (
      <PublicShell>
        <Card>
          <EmptyState
            icon={<Globe2 className="size-5" />}
            title="Online booking isn't available"
            description="This booking page may be paused, online bookings may be switched off, or no services are being offered right now. Please contact the business directly."
          />
        </Card>
      </PublicShell>
    )
  }

  return (
    <PublicShell page={page}>
      <BookingFlow slug={slug} page={page} />
    </PublicShell>
  )
}
