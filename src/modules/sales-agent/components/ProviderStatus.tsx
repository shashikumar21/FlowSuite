import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'

const PROVIDERS = [
  {
    name: 'Business discovery',
    state: 'Manual only',
    detail: 'Saved searches record criteria only. No external business lookup is called.',
  },
  {
    name: 'Contact verification',
    state: 'Not configured',
    detail: 'A valid-looking email is never marked verified. Only explicit attestation or a provider can do that.',
  },
  {
    name: 'Email sending',
    state: 'Not configured',
    detail: 'Campaigns, approvals and the outbox exist as schema only. Nothing can be sent from this build.',
  },
] as const

/** Explicit, honest provider state. No live integration is implied. */
export function ProviderStatus() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider status</CardTitle>
        <CardDescription>External integrations are not connected in this phase.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {PROVIDERS.map((provider) => (
          <div key={provider.name} className="flex flex-col gap-1 rounded-lg border border-ink-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink-900">{provider.name}</p>
              <Badge variant="warning">{provider.state}</Badge>
            </div>
            <p className="text-xs leading-5 text-ink-500">{provider.detail}</p>
          </div>
        ))}
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Add server-side credentials and the corresponding provider adapters before enabling any live outreach.
            Secrets must never be placed in VITE_* variables.
          </span>
        </p>
      </CardContent>
    </Card>
  )
}
