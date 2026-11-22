import { Calendar, CalendarDays, Link2, ShieldAlert } from 'lucide-react'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'

const providers = [
  {
    id: 'google',
    name: 'Google Calendar',
    description: 'Sync appointments and availability with Google Calendar using OAuth.',
    detail: 'Best for clinics using Gmail/Google Workspace.',
  },
  {
    id: 'apple',
    name: 'Apple Calendar',
    description: 'Connect Apple Calendar / iCloud calendar support for scheduling visibility.',
    detail: 'Typically configured via CalDAV/app-specific credentials or Apple integration flow.',
  },
  {
    id: 'outlook',
    name: 'Outlook / Microsoft 365',
    description: 'Connect Microsoft calendars for appointment sync and availability.',
    detail: 'Useful for clinics using Microsoft 365.',
  },
  {
    id: 'other',
    name: 'Other Calendar (CalDAV / iCal)',
    description: 'Connect other calendar systems that support CalDAV or iCal feeds.',
    detail: 'Generic option for compatible calendar providers.',
  },
] as const

export function BookingCalendarPage() {
  const { toast } = useToast()

  const handleConnect = (name: string) => {
    toast({
      title: `${name} connection not configured`,
      description: 'Calendar sync requires provider setup, OAuth/server credentials, and server-side integration. No calendar is connected yet.',
      variant: 'info',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Booking</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Calendar</h1>
          <p className="mt-1 text-sm text-ink-500">
            Connect external calendars to keep appointments and availability in sync.
          </p>
        </div>
        <Badge variant="warning">Connections pending</Badge>
      </div>

      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">No calendar connected</p>
            <p className="mt-1 text-amber-800">
              Calendar connections are not active yet. Real sync needs provider OAuth/app setup, server-side secrets,
              webhook/polling sync, and conflict handling. You can choose a provider here when integration is enabled.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((provider) => (
          <Card key={provider.id}>
            <CardContent className="space-y-4 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    {provider.id === 'other' ? <Link2 className="size-5" /> : <CalendarDays className="size-5" />}
                  </span>
                  <div>
                    <p className="font-semibold text-ink-900">{provider.name}</p>
                    <p className="text-xs text-ink-500">{provider.detail}</p>
                  </div>
                </div>
                <Badge variant="neutral">Not connected</Badge>
              </div>
              <p className="text-sm text-ink-600">{provider.description}</p>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => handleConnect(provider.name)}>
                  <Calendar className="size-4" /> Connect
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
