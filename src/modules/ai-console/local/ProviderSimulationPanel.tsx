import { useEffect, useState } from 'react'
import { Copy, FlaskConical, Unplug } from 'lucide-react'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { copyText } from '@/lib/clipboard'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import {
  addSimulatedConnection,
  loadSimulatedConnections,
  removeSimulatedConnection,
  simulationProviders,
  simulationWebhookUrl,
  type SimulatedConnection,
} from './providerSimulation'

const defaultNames: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  whatsapp: 'WHATSAPP_ACCESS_TOKEN',
  resend: 'EMAIL_PROVIDER_API_KEY',
  exotel: 'VOICE_WEBHOOK_SECRET',
  netlify: 'NETLIFY_DEPLOY_TOKEN',
  vercel: 'VERCEL_DEPLOY_TOKEN',
  other: 'CUSTOM_PROVIDER_KEY',
}

export function ProviderSimulationPanel({ tenantId, canManage }: { tenantId?: string; canManage: boolean }) {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState<string>('openai')
  const [secretName, setSecretName] = useState('OPENAI_API_KEY')
  const [rows, setRows] = useState<SimulatedConnection[]>([])
  const [saving, setSaving] = useState(false)

  const refresh = () => setRows(tenantId ? loadSimulatedConnections(tenantId) : [])
  useEffect(() => { refresh() }, [tenantId])

  const copy = async (value: string, label: string) => {
    const copied = await copyText(value)
    if (copied) toast({ title: `${label} copied` })
    else toast({ title: `Copy ${label.toLowerCase()} manually`, description: value, variant: 'info' })
  }

  const connect = async () => {
    if (!tenantId) return
    setSaving(true)
    try {
      const row = addSimulatedConnection(tenantId, provider, secretName)
      refresh()
      toast({
        title: 'Simulated connection added',
        description: `Dry run for ${row.provider} / ${row.secret_name}. Nothing was encrypted, transmitted or stored on a server.`,
        variant: 'info',
      })
    } catch (e) {
      toast({ title: 'Invalid dry-run input', description: getErrorMessage(e), variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async (row: SimulatedConnection) => {
    if (!tenantId) return
    removeSimulatedConnection(tenantId, row.provider, row.secret_name)
    refresh()
    toast({ title: 'Simulated connection removed', description: 'No provider or hosted record was changed.', variant: 'info' })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><FlaskConical className="size-4 text-brand-600" /> Local provider dry run</CardTitle>
            <CardDescription>
              Rehearse the connect/disconnect flow without a provider, real credentials or hosted writes. Simulated rows live only in this browser tab and are never sent anywhere.
            </CardDescription>
          </div>
          <Button variant={enabled ? 'outline' : 'primary'} onClick={() => setEnabled((value) => !value)} disabled={!canManage}>
            {enabled ? 'Turn off dry run' : 'Turn on dry run'}
          </Button>
        </div>
      </CardHeader>
      {enabled ? (
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">Simulation only</p>
            <p className="mt-1">
              Do not paste a real API key here. This form accepts a secret name only. It does not contact Google, Meta, Razorpay, an email provider or Supabase, and it cannot make calls or send messages.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <Label>Provider</Label>
              <select
                className="w-full rounded-lg border border-line-200 px-3 py-2 text-sm"
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value)
                  setSecretName(defaultNames[event.target.value] ?? '')
                }}
              >
                {simulationProviders.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <Label>Secret name (no value)</Label>
              <Input value={secretName} onChange={(event) => setSecretName(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} />
            </label>
          </div>
          <Button onClick={() => void connect()} loading={saving} disabled={!tenantId || !canManage}>Add simulated connection</Button>

          <div className="space-y-2">
            <p className="font-medium text-ink-900">Simulated connections</p>
            {rows.length === 0 ? (
              <p className="text-xs text-ink-500">None yet.</p>
            ) : rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-200 p-3">
                <div>
                  <p className="font-medium text-ink-900">{row.provider} · <code className="rounded bg-ink-50 px-1 text-xs">{row.secret_name}</code></p>
                  <p className="text-xs text-ink-500">Simulated at {formatDateTime(row.updated_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">simulation</Badge>
                  <Button variant="outline" size="sm" onClick={() => void disconnect(row)}><Unplug className="size-4" /> Remove</Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="font-medium text-ink-900">Example webhook targets</p>
            {['whatsapp-webhook', 'telephony-webhook', 'ai-chat'].map((endpoint) => {
              const url = simulationWebhookUrl('', endpoint)
              return (
                <div key={endpoint} className="flex flex-wrap items-center gap-2">
                  <span className="w-36 shrink-0 text-xs text-ink-600">{endpoint}</span>
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-50 p-2 text-xs text-ink-700">{url}</code>
                  <Button size="sm" variant="outline" onClick={() => void copy(url, `${endpoint} simulation URL`)}><Copy className="size-4" /> Copy</Button>
                </div>
              )
            })}
            <p className="text-xs text-ink-500">These local.invalid URLs cannot resolve. They are shown to document configuration targets, not to register with a provider.</p>
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}
