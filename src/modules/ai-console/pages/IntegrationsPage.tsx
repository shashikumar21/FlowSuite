import { useEffect, useState } from 'react'
import { Copy, Link2, Plug, Plus, ShieldAlert, ShieldCheck, Unplug } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Input, Label } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import type { ChannelCredentialRow, MessageTemplateRow } from '@/types/database'
import { CredentialFormModal } from '../components/CredentialFormModal'
import { TemplateFormModal } from '../components/TemplateFormModal'
import { CredentialStatusBadge } from '../components/StatusBadges'
import { disconnectIntegrationSecret, listIntegrationSecrets, saveIntegrationSecret, type IntegrationSecretMeta } from '../api'
import { useIntegrationsData, useAiConsoleInvalidate } from '../hooks'
import { chatEndpointUrl } from '../utils'

const providerHelp: Record<string, { title: string; secret: string; note: string }> = {
  openai: {
    title: 'AI provider (OpenAI)',
    secret: 'OPENAI_API_KEY',
    note: 'Set AI_PROVIDER=openai and OPENAI_API_KEY in Supabase Edge Function secrets. The key never reaches the browser.',
  },
  whatsapp: {
    title: 'WhatsApp Cloud API',
    secret: 'WHATSAPP_ACCESS_TOKEN',
    note: 'Use the official Meta Graph API. Subscribe the webhook to messages and set WHATSAPP_VERIFY_TOKEN plus WHATSAPP_APP_SECRET.',
  },
  exotel: {
    title: 'Telephony (inbound voice)',
    secret: 'VOICE_WEBHOOK_SECRET',
    note: 'Foundation only: verified call events are recorded. No STT, TTS, audio playback or dialling is enabled.',
  },
  resend: {
    title: 'Email delivery',
    secret: 'RESEND_API_KEY',
    note: 'The Milestone 3 email seam remains unwired by design; no automated email is sent.',
  },
  netlify: {
    title: 'Website deploy (Netlify)',
    secret: 'NETLIFY_DEPLOY_TOKEN',
    note: 'For direct website deploys. Set NETLIFY_DEPLOY_TOKEN in Supabase Edge Function secrets (server-side only). Do not paste tokens in chat or store in client code.',
  },
  vercel: {
    title: 'Website deploy (Vercel)',
    secret: 'VERCEL_DEPLOY_TOKEN',
    note: 'For direct website deploys. Set VERCEL_DEPLOY_TOKEN in Supabase Edge Function secrets (server-side only). Do not paste tokens in chat or store in client code.',
  },
}

export function IntegrationsPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const query = useIntegrationsData(tenantId)
  const invalidate = useAiConsoleInvalidate(tenantId)
  const { toast } = useToast()
  const [credentialOpen, setCredentialOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplateRow | null>(null)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [vaultSecrets, setVaultSecrets] = useState<IntegrationSecretMeta[]>([])
  const [vaultLoading, setVaultLoading] = useState(false)
  const [vaultSaving, setVaultSaving] = useState(false)
  const [vaultProvider, setVaultProvider] = useState('netlify')
  const [vaultSecretName, setVaultSecretName] = useState('NETLIFY_DEPLOY_TOKEN')
  const [vaultSecretValue, setVaultSecretValue] = useState('')

  const loadVaultSecrets = async () => {
    if (!tenantId) return
    setVaultLoading(true)
    try { setVaultSecrets(await listIntegrationSecrets(tenantId)) } catch { /* vault may not be applied yet */ } finally { setVaultLoading(false) }
  }

  useEffect(() => { void loadVaultSecrets() }, [tenantId])

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast({ title: `${label} copied` })
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy the text manually.', variant: 'error' })
    }
  }

  const onVaultProviderChange = (provider: string) => {
    setVaultProvider(provider)
    const defaults: Record<string, string> = { netlify: 'NETLIFY_DEPLOY_TOKEN', vercel: 'VERCEL_DEPLOY_TOKEN', openai: 'OPENAI_API_KEY', whatsapp: 'WHATSAPP_ACCESS_TOKEN', resend: 'RESEND_API_KEY', exotel: 'VOICE_WEBHOOK_SECRET' }
    setVaultSecretName(defaults[provider] ?? '')
  }

  const saveVault = async () => {
    if (!tenantId) return
    if (!vaultSecretName.trim() || !vaultSecretValue.trim()) { toast({ title: 'Secret name and value required', variant: 'error' }); return }
    setVaultSaving(true)
    try {
      await saveIntegrationSecret({ tenantId, provider: vaultProvider, secretName: vaultSecretName.trim(), secretValue: vaultSecretValue })
      toast({ title: 'Connected securely', description: 'Secret encrypted and stored server-side. It is never shown again.' })
      setVaultSecretValue('')
      setVaultOpen(false)
      await loadVaultSecrets()
    } catch (e) { toast({ title: 'Could not save secret', description: getErrorMessage(e), variant: 'error' }) }
    finally { setVaultSaving(false) }
  }

  const disconnectVault = async (provider: string, secretName: string) => {
    if (!tenantId) return
    try {
      await disconnectIntegrationSecret(tenantId, provider, secretName)
      toast({ title: 'Disconnected', description: `${secretName} removed.` })
      await loadVaultSecrets()
    } catch (e) { toast({ title: 'Could not disconnect', description: getErrorMessage(e), variant: 'error' }) }
  }

  if (query.isError) {
    return <Card><CardContent><ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /></CardContent></Card>
  }
  if (query.isLoading || !query.data) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>
  }

  const { canManage, channels, credentials, templates } = query.data
  const functionBase = chatEndpointUrl().replace(/\/ai-chat$/, '')
  const findCredential = (provider: string): ChannelCredentialRow | undefined =>
    credentials.find((credential) => credential.provider === provider)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Integrations</h1>
          <p className="mt-1 text-sm text-ink-500">
            Connect providers securely for your business. Secrets are encrypted server-side (vault) or stored as server-side secret references; raw keys are never stored in the browser.
          </p>
        </div>
        <Button disabled={!canManage || channels.length === 0} onClick={() => setCredentialOpen(true)}>
          <Plus className="size-4" /> Link credential
        </Button>
      </div>

      {!canManage ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <p>Only owners and admins can view or change credentials and templates.</p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-600" /> Secure Direct Connect</CardTitle>
              <CardDescription>Connect provider keys securely. Your key is sent over HTTPS to an Edge Function, encrypted server-side, and never stored in browser/plain DB. FlowSuite shows only connection status.</CardDescription>
            </div>
            <Button onClick={() => setVaultOpen(true)} disabled={!canManage}><Link2 className="size-4" /> Connect provider</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-ink-700">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 text-xs">
            <p className="font-semibold">Sellable SaaS flow</p>
            <p className="mt-1">Customers connect once - no raw keys pasted into chat or stored in client code. For OAuth providers (Google), use direct OAuth Connect. For API-key providers, use this secure vault connect.</p>
          </div>
          {vaultLoading ? <p className="text-xs text-ink-500">Loading connections...</p> : vaultSecrets.length === 0 ? (
            <p className="text-xs text-ink-500">No secure vault connections yet. Vault requires migration <code className="rounded bg-ink-50 px-1">0033_integration_secret_vault.sql</code> and <code className="rounded bg-ink-50 px-1">integrations-vault-save</code> Edge Function (approval-gated).</p>
          ) : (
            <div className="space-y-2">
              {vaultSecrets.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-200 p-3">
                  <div>
                    <p className="font-medium text-ink-900">{s.provider} · <code className="rounded bg-ink-50 px-1 text-xs">{s.secret_name}</code></p>
                    <p className="text-xs text-ink-500">Status: {s.status} · Updated {formatDateTime(s.updated_at)}</p>
                  </div>
                  {canManage && s.status === 'connected' ? <Button variant="outline" size="sm" onClick={() => void disconnectVault(s.provider, s.secret_name)}><Unplug className="size-4" /> Disconnect</Button> : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(providerHelp).map(([provider, help]) => {
          const credential = findCredential(provider)
          const active = credential?.status === 'active'
          return (
            <Card key={provider}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{help.title}</CardTitle>
                    <CardDescription>{help.note}</CardDescription>
                  </div>
                  {credential ? <CredentialStatusBadge status={credential.status} /> : <Badge>not configured</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-ink-700">
                  Secret name: <code className="rounded bg-ink-50 px-1.5 py-0.5 text-xs">{help.secret}</code>
                </p>
                {credential ? (
                  <p className="text-xs text-ink-500">
                    Reference <code>{credential.secret_ref}</code> · {credential.external_identifier ?? 'no external ID'} ·
                    verified {formatDateTime(credential.last_verified_at)} · {active ? 'ready for server-side use' : 'not active'}
                  </p>
                ) : (
                  <p className="text-xs text-ink-500">No credential reference saved. Live calls remain disabled.</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Website direct deploy (setup)</CardTitle>
          <CardDescription>Direct deploy from the Websites tab requires server-side provider secrets. Never paste tokens in chat; never store raw tokens in client code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-ink-700">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <p className="font-semibold">Security rule</p>
            <p className="mt-1 text-xs">Do not enter raw API tokens into FlowSuite forms. Set deploy tokens as <strong>Supabase Edge Function secrets</strong> (server-side). This page only stores secret reference names, never secret values.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-ink-200 p-3">
              <p className="font-semibold text-ink-900">Netlify</p>
              <p className="mt-1 text-xs text-ink-500">Set secret: <code className="rounded bg-ink-50 px-1">NETLIFY_DEPLOY_TOKEN</code></p>
              <p className="mt-1 text-xs text-ink-500">Supabase Dashboard → Project Settings → Edge Functions → Secrets. Or CLI: <code className="rounded bg-ink-50 px-1">supabase secrets set NETLIFY_DEPLOY_TOKEN=...</code></p>
            </div>
            <div className="rounded-lg border border-ink-200 p-3">
              <p className="font-semibold text-ink-900">Vercel</p>
              <p className="mt-1 text-xs text-ink-500">Set secret: <code className="rounded bg-ink-50 px-1">VERCEL_DEPLOY_TOKEN</code></p>
              <p className="mt-1 text-xs text-ink-500">Supabase Dashboard → Project Settings → Edge Functions → Secrets. Or CLI: <code className="rounded bg-ink-50 px-1">supabase secrets set VERCEL_DEPLOY_TOKEN=...</code></p>
            </div>
          </div>
          <p className="text-xs text-ink-500">After secrets are set and deploy functions are deployed (explicit approval required), the Websites tab can use them for direct deploy. Current status: UI ready, provider deploy not configured.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook endpoints</CardTitle>
          <CardDescription>Register these URLs with the provider after the functions are deployed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'WhatsApp inbound', url: `${functionBase}/whatsapp-webhook` },
            { label: 'Telephony inbound', url: `${functionBase}/telephony-webhook` },
            { label: 'Website chat', url: `${functionBase}/ai-chat` },
          ].map((item) => (
            <div key={item.label} className="flex flex-wrap items-center gap-2">
              <span className="w-36 shrink-0 text-sm text-ink-600">{item.label}</span>
              <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-50 p-2 text-xs text-ink-700">{item.url || 'Set VITE_SUPABASE_URL first'}</code>
              <Button size="sm" variant="outline" disabled={!item.url} onClick={() => void copy(item.url, `${item.label} URL`)}>
                <Copy className="size-4" /> Copy
              </Button>
            </div>
          ))}
          <p className="text-xs text-ink-500">
            Deployment is not part of this milestone. These URLs are configuration targets, not live endpoints.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channels and credential references</CardTitle>
          <CardDescription>Only active channels can be linked. The secret reference is a name, not a token.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {channels.length === 0 ? (
            <EmptyState icon={<Plug className="size-5" />} title="No channels" description="Create a WhatsApp or website chat channel first." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-5 py-3">Channel</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Credential references</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {channels.map((channel) => (
                    <tr key={channel.id}>
                      <td className="px-5 py-3 font-medium text-ink-900">{channel.name}</td>
                      <td className="px-5 py-3 text-ink-600">{channel.channel_type}</td>
                      <td className="px-5 py-3"><Badge variant={channel.active ? 'success' : 'neutral'}>{channel.active ? 'active' : 'inactive'}</Badge></td>
                      <td className="px-5 py-3 text-ink-600">
                        {canManage
                          ? credentials.filter((credential) => credential.channel_id === channel.id)
                              .map((credential) => `${credential.provider}: ${credential.secret_ref}`).join(', ') || '—'
                          : 'Admins only'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Message templates</CardTitle>
            <CardDescription>
              Required for WhatsApp sends outside Meta's 24-hour window. A local "approved" flag does not replace Meta approval.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={!canManage} onClick={() => { setEditingTemplate(null); setTemplateOpen(true) }}>
            <Plus className="size-4" /> Add template
          </Button>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {templates.length === 0 ? (
            <EmptyState icon={<Plus className="size-5" />} title="No templates" description="Add an approved follow-up template before enabling WhatsApp follow-ups." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-5 py-3">Key</th>
                    <th className="px-5 py-3">Provider</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td className="px-5 py-3 font-medium text-ink-900">{template.template_key}</td>
                      <td className="px-5 py-3 text-ink-600">{template.provider}</td>
                      <td className="px-5 py-3 text-ink-600">{template.category}</td>
                      <td className="px-5 py-3"><Badge variant={template.status === 'approved' ? 'success' : template.status === 'rejected' ? 'danger' : 'neutral'}>{template.status}</Badge></td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => { setEditingTemplate(template); setTemplateOpen(true) }}>Edit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CredentialFormModal
        open={credentialOpen}
        onClose={() => setCredentialOpen(false)}
        tenantId={tenantId ?? ''}
        channels={channels}
        onSaved={invalidate}
      />
      <TemplateFormModal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        tenantId={tenantId ?? ''}
        template={editingTemplate}
        onSaved={invalidate}
      />

      <Modal open={vaultOpen} onClose={() => setVaultOpen(false)} title="Secure Direct Connect" description="Enter provider secret once. It is sent over HTTPS to an Edge Function, encrypted server-side, and never shown again.">
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">Security</p>
            <p className="mt-1">Do not paste secrets in chat. This form submits directly to server-side vault function. Requires <code className="rounded bg-amber-100 px-1">0033_integration_secret_vault.sql</code> applied and <code className="rounded bg-amber-100 px-1">integrations-vault-save</code> deployed with <code className="rounded bg-amber-100 px-1">CREDENTIALS_ENCRYPTION_KEY</code> set (approval-gated).</p>
          </div>
          <label className="block space-y-1.5">
            <Label>Provider</Label>
            <select className="w-full rounded-lg border border-line-200 px-3 py-2 text-sm" value={vaultProvider} onChange={(e) => onVaultProviderChange(e.target.value)}>
              <option value="netlify">Netlify</option>
              <option value="vercel">Vercel</option>
              <option value="openai">OpenAI / AI provider</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="resend">Resend</option>
              <option value="exotel">Exotel</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <Label>Secret name</Label>
            <Input value={vaultSecretName} onChange={(e) => setVaultSecretName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} placeholder="NETLIFY_DEPLOY_TOKEN" />
          </label>
          <label className="block space-y-1.5">
            <Label>Secret value</Label>
            <Input type="password" value={vaultSecretValue} onChange={(e) => setVaultSecretValue(e.target.value)} placeholder="Paste provider token/key securely" autoComplete="off" />
            <p className="text-xs text-ink-500">Value is used only for this secure submit and never stored in browser state after save.</p>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setVaultOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveVault()} loading={vaultSaving} disabled={!canManage}><ShieldCheck className="size-4" /> Connect securely</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
