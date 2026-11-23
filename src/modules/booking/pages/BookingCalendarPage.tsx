import { useEffect, useState } from 'react'
import { Calendar, CalendarDays, Link2, RefreshCw, ShieldAlert, Unplug } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { disconnectCalendarConnection, fetchCalendarConnectionStatus, startGoogleCalendarOAuth, type CalendarConnectionStatus } from '../api'
import { AppointmentCalendar } from '../components/AppointmentCalendar'
import { useBookingAppointments } from '../hooks'
import { DEFAULT_BUSINESS_TIMEZONE } from '../utils'

const otherProviders = [
  { id: 'apple', name: 'Apple Calendar', description: 'Apple/iCloud calendar connection (CalDAV/app integration) is not configured yet.', detail: 'Coming later' },
  { id: 'outlook', name: 'Outlook / Microsoft 365', description: 'Microsoft calendar OAuth/sync is not configured yet.', detail: 'Coming later' },
  { id: 'other', name: 'Other Calendar (CalDAV / iCal)', description: 'Generic CalDAV/iCal connection is not configured yet.', detail: 'Coming later' },
] as const

export function BookingCalendarPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const timeZone = activeTenant?.businesses?.timezone ?? DEFAULT_BUSINESS_TIMEZONE
  const appointmentsQuery = useBookingAppointments(tenantId, { timeZone, limit: 500 })
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<CalendarConnectionStatus | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const loadStatus = async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const row = await fetchCalendarConnectionStatus(tenantId)
      setStatus(row ?? { connected: false, provider: 'google', google_email: null, calendar_id: 'primary', status: 'disconnected', sync_enabled: false, last_synced_at: null, last_error: null, updated_at: null })
    } catch (e) {
      setError(getErrorMessage(e))
    } finally { setLoading(false) }
  }

  const refreshAll = () => {
    void loadStatus()
    void appointmentsQuery.refetch()
  }

  useEffect(() => { void loadStatus() }, [tenantId])

  useEffect(() => {
    const connected = params.get('calendar_connected')
    const calendarError = params.get('calendar_error')
    if (connected === 'google') {
      toast({ title: 'Google Calendar connected', description: 'Your Google account is connected. New FlowSuite appointments will sync to Google Calendar.' })
      params.delete('calendar_connected'); setParams(params, { replace: true })
      void loadStatus()
    } else if (calendarError) {
      toast({ title: 'Google Calendar connection failed', description: calendarError.replace(/_/g, ' '), variant: 'error' })
      params.delete('calendar_error'); setParams(params, { replace: true })
    }
  }, [params])

  const connectGoogle = async () => {
    if (!tenantId) return
    setConnecting(true)
    try {
      const url = await startGoogleCalendarOAuth(tenantId)
      window.location.href = url
    } catch (e) {
      toast({ title: 'Could not start Google connection', description: getErrorMessage(e), variant: 'error' })
      setConnecting(false)
    }
  }

  const disconnectGoogle = async () => {
    if (!tenantId) return
    if (!window.confirm('Disconnect Google Calendar? Stored tokens will be cleared.')) return
    setDisconnecting(true)
    try {
      await disconnectCalendarConnection(tenantId)
      toast({ title: 'Google Calendar disconnected' })
      await loadStatus()
    } catch (e) {
      toast({ title: 'Could not disconnect', description: getErrorMessage(e), variant: 'error' })
    } finally { setDisconnecting(false) }
  }

  if (!tenantId) return <ErrorState message="Select a business to manage calendar connections." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Booking</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Calendar</h1>
          <p className="mt-1 text-sm text-ink-500">View your FlowSuite appointments and manage external calendar connections.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} loading={loading || appointmentsQuery.isFetching}><RefreshCw className="size-4" /> Refresh</Button>
      </div>

      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Google Calendar connection + sync runtime deployed</p>
            <p className="mt-1 text-amber-800">OAuth connect/disconnect and FlowSuite → Google sync functions are deployed, with single-use state stored in Supabase. Google OAuth credentials are configured server-side, and tokens remain server-side only.</p>
          </div>
        </CardContent>
      </Card>

      {error ? <ErrorState message={error} onRetry={refreshAll} /> : null}

      <AppointmentCalendar
        appointments={appointmentsQuery.data ?? []}
        timeZone={timeZone}
        loading={appointmentsQuery.isLoading}
        error={appointmentsQuery.isError ? getErrorMessage(appointmentsQuery.error) : null}
        onRetry={() => void appointmentsQuery.refetch()}
      />

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Google Calendar connection</h2>
          <p className="text-sm text-ink-500">Optional. Connect Google only if you want FlowSuite appointments pushed to your Google Calendar.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><CalendarDays className="size-5" /></span>
                <div>
                  <p className="font-semibold text-ink-900">Google Calendar</p>
                  <p className="text-xs text-ink-500">One business calendar connection (recommended v1)</p>
                </div>
              </div>
              {loading ? <Skeleton className="h-6 w-24" /> : <Badge variant={status?.connected ? 'success' : 'neutral'}>{status?.connected ? 'Connected' : 'Not connected'}</Badge>}
            </div>

            {loading ? <Skeleton className="h-16 w-full" /> : status?.connected ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                <p><span className="font-medium">Account:</span> {status.google_email ?? 'Connected Google account'}</p>
                <p><span className="font-medium">Calendar:</span> {status.calendar_id ?? 'primary'}</p>
                <p><span className="font-medium">Sync:</span> {status.sync_enabled ? 'Enabled' : 'Not enabled (Phase 2)'}</p>
                {status.last_error ? <p className="text-red-700">Last error: {status.last_error}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-ink-600">Connect your Google account to prepare FlowSuite → Google appointment sync. The Edge Functions and server-side OAuth credentials are configured; no raw key is stored in the browser.</p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {status?.connected ? (
                <Button variant="outline" onClick={() => void disconnectGoogle()} loading={disconnecting}><Unplug className="size-4" /> Disconnect</Button>
              ) : (
                <Button onClick={() => void connectGoogle()} loading={connecting}><Calendar className="size-4" /> Connect Google Calendar</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {otherProviders.map((provider) => (
          <Card key={provider.id}>
            <CardContent className="space-y-4 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{provider.id === 'other' ? <Link2 className="size-5" /> : <CalendarDays className="size-5" />}</span>
                  <div><p className="font-semibold text-ink-900">{provider.name}</p><p className="text-xs text-ink-500">{provider.detail}</p></div>
                </div>
                <Badge variant="neutral">Not connected</Badge>
              </div>
              <p className="text-sm text-ink-600">{provider.description}</p>
              <div className="flex justify-end"><Button variant="outline" onClick={() => toast({ title: `${provider.name} not configured`, description: 'This provider is planned after Google Calendar Phase 1/2.', variant: 'info' })}>Connect</Button></div>
            </CardContent>
          </Card>
        ))}
        </div>
      </div>
    </div>
  )
}
