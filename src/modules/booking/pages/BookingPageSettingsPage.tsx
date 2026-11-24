import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, ExternalLink, Globe2, Info, LockKeyhole } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Input, Label, Textarea } from '@/components/ui/Input'
import { copyText } from '@/lib/clipboard'
import { getErrorMessage } from '@/lib/errors'
import { updatePageSettings } from '../api'
import { FormError } from '../components/FormError'
import { PatientEmailSettingsCard } from '../components/PatientEmailSettingsCard'
import { useBookingInvalidate, useBookingOptions, useBookingPageSettings } from '../hooks'
import { pageSettingsSchema, type PageSettingsFormInput, type PageSettingsFormValues } from '../schemas'

const emptyValues: PageSettingsFormInput = {
  title: '',
  description: '',
  primary_color: '#4f46e5',
  logo_url: '',
  lead_time_minutes: '60',
  booking_horizon_days: '60',
  slot_interval_minutes: '15',
  require_email: true,
  require_phone: true,
  allow_cancellation: true,
  allow_rescheduling: true,
  cancellation_hours: '4',
  active: true,
  service_ids: [],
}

export function BookingPageSettingsPage() {
  const { user } = useAuth()
  const { activeTenant, can } = useTenant()
  const { toast } = useToast()
  const tenantId = activeTenant?.tenant_id
  const canManageConfig = can('manage_booking_config')
  const invalidate = useBookingInvalidate(tenantId)

  const settingsQuery = useBookingPageSettings(tenantId)
  const optionsQuery = useBookingOptions(tenantId)
  const settings = settingsQuery.data
  const page = settings?.page ?? null
  const services = optionsQuery.data?.services ?? []
  const publicUrl = page && typeof window !== 'undefined' ? `${window.location.origin}/book/${page.slug}` : ''

  const form = useForm<PageSettingsFormInput, unknown, PageSettingsFormValues>({
    resolver: zodResolver(pageSettingsSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!settings) return
    const current = settings.page
    form.reset({
      title: current?.title ?? `${activeTenant?.businesses?.name ?? 'Business'} booking`,
      description: current?.description ?? '',
      primary_color: current?.primary_color || '#4f46e5',
      logo_url: current?.logo_url ?? '',
      lead_time_minutes: String(current?.lead_time_minutes ?? 60),
      booking_horizon_days: String(current?.booking_horizon_days ?? 60),
      slot_interval_minutes: String(current?.slot_interval_minutes ?? 15),
      require_email: current?.require_email ?? true,
      require_phone: current?.require_phone ?? true,
      allow_cancellation: current?.allow_cancellation ?? true,
      allow_rescheduling: current?.allow_rescheduling ?? true,
      cancellation_hours: String(current?.cancellation_hours ?? 4),
      active: current?.active ?? true,
      service_ids: settings.serviceIds,
    })
  }, [settings, activeTenant?.businesses?.name, form])

  const onSubmit = form.handleSubmit(async (values) => {
    if (!tenantId || !page) {
      form.setError('root', { message: 'No booking page is configured for this business.' })
      return
    }
    try {
      await updatePageSettings(tenantId, page.id, values)
      toast({ title: 'Booking page updated', description: 'Customers will see the new settings immediately.' })
      invalidate()
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error) })
    }
  })

  const copyLink = async () => {
    if (!publicUrl) return
    const copied = await copyText(publicUrl)
    if (copied) toast({ title: 'Booking link copied' })
    else toast({ title: 'Copy this booking link', description: publicUrl, variant: 'info' })
  }

  const isLoading = settingsQuery.isLoading || optionsQuery.isLoading
  const isError = settingsQuery.isError || optionsQuery.isError

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Booking setup</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Booking page</h1>
          <p className="mt-1 text-sm text-ink-500">
            Customize the page customers use to book online. Changes are attributed to {user?.email ?? 'your team'}.
          </p>
        </div>
        {publicUrl ? (
          <Button variant="outline" onClick={() => { void copyLink() }}>
            <Copy className="size-4" /> Copy booking link
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Card><CardContent className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-20" /><Skeleton className="h-10" /></CardContent></Card>
          <Card><CardContent className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></CardContent></Card>
        </div>
      ) : isError ? (
        <Card>
          <ErrorState
            message="We couldn't load your booking page settings."
            onRetry={() => {
              void settingsQuery.refetch()
              void optionsQuery.refetch()
            }}
          />
        </Card>
      ) : !page ? (
        <Card>
          <EmptyState
            icon={<Globe2 className="size-5" />}
            title="No booking page is configured"
            description="A booking page is normally created with your business. Ask a business owner to finish setup before sharing a link."
          />
        </Card>
      ) : (
        <>
          {!canManageConfig ? (
            <div className="flex items-start gap-2 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-600">
              <LockKeyhole className="mt-0.5 size-4 shrink-0" />
              <span>You have read-only access to booking configuration. Owners, admins and managers can change these settings.</span>
            </div>
          ) : null}

          {settings && !settings.onlineBookingsEnabled ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Online bookings are switched off in business settings. This page stays hidden from customers until that is enabled.
              </span>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Page content &amp; rules</CardTitle>
                <CardDescription>Times are interpreted in the business timezone; the server validates every value.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onSubmit} className="space-y-5" noValidate>
                  <FormError message={form.formState.errors.root?.message} />

                  <fieldset disabled={!canManageConfig} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label htmlFor="page-title">Page title</Label>
                        <Input id="page-title" autoFocus {...form.register('title')} />
                        <FieldError>{form.formState.errors.title?.message}</FieldError>
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="page-description">Description</Label>
                        <Textarea id="page-description" {...form.register('description')} />
                        <FieldError>{form.formState.errors.description?.message}</FieldError>
                      </div>
                      <div>
                        <Label htmlFor="page-color">Accent color</Label>
                        <Input id="page-color" type="color" className="h-10 p-1" {...form.register('primary_color')} />
                        <FieldError>{form.formState.errors.primary_color?.message}</FieldError>
                      </div>
                      <div>
                        <Label htmlFor="page-logo">Logo URL</Label>
                        <Input id="page-logo" type="url" placeholder="https://…" {...form.register('logo_url')} />
                        <FieldError>{form.formState.errors.logo_url?.message}</FieldError>
                      </div>
                      <div>
                        <Label htmlFor="page-lead-time">Minimum notice (minutes)</Label>
                        <Input id="page-lead-time" type="number" min={0} max={10080} {...form.register('lead_time_minutes')} />
                        <FieldError>{form.formState.errors.lead_time_minutes?.message}</FieldError>
                      </div>
                      <div>
                        <Label htmlFor="page-horizon">Booking horizon (days)</Label>
                        <Input id="page-horizon" type="number" min={1} max={365} {...form.register('booking_horizon_days')} />
                        <FieldError>{form.formState.errors.booking_horizon_days?.message}</FieldError>
                      </div>
                      <div>
                        <Label htmlFor="page-interval">Slot interval (minutes)</Label>
                        <Input id="page-interval" type="number" min={5} max={240} step={5} {...form.register('slot_interval_minutes')} />
                        <FieldError>{form.formState.errors.slot_interval_minutes?.message}</FieldError>
                      </div>
                      <div>
                        <Label htmlFor="page-cancellation-hours">Change cutoff (hours)</Label>
                        <Input id="page-cancellation-hours" type="number" min={0} max={720} {...form.register('cancellation_hours')} />
                        <FieldError>{form.formState.errors.cancellation_hours?.message}</FieldError>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border border-ink-200 p-3">
                      <p className="text-sm font-medium text-ink-700">Contact details customers must provide</p>
                      <label className="flex items-center gap-2 text-sm text-ink-700">
                        <input type="checkbox" className="size-4" {...form.register('require_email')} />
                        Require an email address
                      </label>
                      <label className="flex items-center gap-2 text-sm text-ink-700">
                        <input type="checkbox" className="size-4" {...form.register('require_phone')} />
                        Require a phone number
                      </label>
                      <FieldError>{form.formState.errors.require_email?.message ?? form.formState.errors.require_phone?.message}</FieldError>
                    </div>

                    <div className="space-y-2 rounded-lg border border-ink-200 p-3">
                      <p className="text-sm font-medium text-ink-700">What customers can do after booking</p>
                      <label className="flex items-center gap-2 text-sm text-ink-700">
                        <input type="checkbox" className="size-4" {...form.register('allow_cancellation')} />
                        Allow online cancellation
                      </label>
                      <label className="flex items-center gap-2 text-sm text-ink-700">
                        <input type="checkbox" className="size-4" {...form.register('allow_rescheduling')} />
                        Allow online rescheduling
                      </label>
                    </div>

                    <div className="space-y-2 rounded-lg border border-ink-200 p-3">
                      <p className="text-sm font-medium text-ink-700">Services offered on this page</p>
                      {services.length === 0 ? (
                        <p className="text-sm text-ink-500">Add services first; customers need at least one to book.</p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {services.map((service) => (
                            <label key={service.id} className="flex items-center gap-2 text-sm text-ink-700">
                              <input type="checkbox" className="size-4" value={service.id} {...form.register('service_ids')} />
                              {service.name}
                              {!service.active ? <span className="text-xs text-ink-400">(inactive)</span> : null}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <label className="flex items-center gap-2 text-sm text-ink-700">
                      <input type="checkbox" className="size-4" {...form.register('active')} />
                      Page is live for customers
                    </label>
                  </fieldset>

                  {canManageConfig ? (
                    <div className="flex justify-end pt-1">
                      <Button type="submit" loading={form.formState.isSubmitting}>Save booking page</Button>
                    </div>
                  ) : null}
                </form>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {tenantId ? (
                <PatientEmailSettingsCard
                  tenantId={tenantId}
                  canManage={canManageConfig}
                  timezone={activeTenant?.businesses?.timezone ?? 'Asia/Kolkata'}
                />
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>Share this page</CardTitle>
                  <CardDescription>Only the slug is public — no business data is exposed in the URL.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {publicUrl ? (
                    <>
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 break-all text-sm font-semibold text-brand-600 hover:text-brand-700"
                      >
                        {publicUrl} <ExternalLink className="size-4 shrink-0" />
                      </a>
                      <Button size="sm" variant="outline" onClick={() => { void copyLink() }}>
                        <Copy className="size-4" /> Copy link
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-ink-500">No public link is available.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>How slots work</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-ink-600">
                  <p>Available times are computed on the server from weekly hours, exceptions and existing appointments.</p>
                  <p>No time is offered inside the minimum notice window, and every booking is re-validated when it is submitted.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
