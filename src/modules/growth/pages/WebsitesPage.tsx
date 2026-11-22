import { useState } from 'react'
import { Copy, Download, Eye, Globe, Package, Pencil, Plus, Rocket, Settings2, Sparkles, Trash2 } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { requireSupabase } from '@/integrations/supabase/client'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import type { GrowthSiteRow, GrowthSubmissionRow } from '@/types/database'
import { SiteFormModal } from '../components/SiteFormModal'
import { SubmissionFormModal } from '../components/SubmissionFormModal'
import { makeDeployPack, makeZip, websiteTemplates, withTemplateDefaults, type WebsiteTemplate, type WebsiteTemplateData } from '../websiteTemplates'
import {
  useDeleteGrowthSite,
  useDeleteGrowthSubmission,
  useGrowthSubmissions,
  useGrowthWebsites,
  useUpdateGrowthSubmission,
} from '../hooks'
import { submissionUpdateSchema, submissionStatuses } from '../schemas'
import type { SiteOption } from '../types'
import { canManageGrowth, siteStatusLabel, statusVariant, submissionStatusLabel } from '../utils'

export function WebsitesPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const canManage = canManageGrowth(activeTenant?.role)
  const { toast } = useToast()
  const sitesQuery = useGrowthWebsites(tenantId)
  const submissionsQuery = useGrowthSubmissions(tenantId)
  const deleteSite = useDeleteGrowthSite(tenantId)
  const updateSubmission = useUpdateGrowthSubmission(tenantId)
  const deleteSubmission = useDeleteGrowthSubmission(tenantId)

  const [siteOpen, setSiteOpen] = useState(false)
  const [editingSite, setEditingSite] = useState<GrowthSiteRow | null>(null)
  const [submissionOpen, setSubmissionOpen] = useState(false)
  const [defaultWebsiteId, setDefaultWebsiteId] = useState<string | undefined>()
  const [previewTemplate, setPreviewTemplate] = useState<WebsiteTemplate | null>(null)
  const [deployTemplate, setDeployTemplate] = useState<WebsiteTemplate | null>(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [custom, setCustom] = useState({ headline: '', subheadline: '', ctaText: 'Book appointment', s1n: 'Consultation', s1p: '₹500', s1d: 'Initial assessment and treatment plan.', s2n: 'Cleaning / Care', s2p: '₹1,200', s2d: 'Routine care with professional guidance.', s3n: 'Follow-up', s3p: '₹300', s3d: 'Review progress and adjust plan.' })

  const templateData: WebsiteTemplateData = withTemplateDefaults({
    businessName: activeTenant?.businesses?.name ?? 'Your Business',
    phone: activeTenant?.businesses?.phone ?? '',
    email: activeTenant?.businesses?.email ?? '',
    headline: custom.headline || undefined,
    subheadline: custom.subheadline || undefined,
    ctaText: custom.ctaText || undefined,
    services: [
      { name: custom.s1n, price: custom.s1p, description: custom.s1d },
      { name: custom.s2n, price: custom.s2p, description: custom.s2d },
      { name: custom.s3n, price: custom.s3p, description: custom.s3d },
    ],
  } as Partial<WebsiteTemplateData>)
  const buildTemplate = (tpl: WebsiteTemplate) => tpl.build(templateData)
  const downloadTemplate = (tpl: WebsiteTemplate) => {
    const html = buildTemplate(tpl)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${tpl.id}.html`; a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'Template downloaded', description: `${tpl.id}.html saved.` })
  }
  const downloadDeployPack = (tpl: WebsiteTemplate) => {
    const blob = makeDeployPack(tpl, templateData)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${tpl.id}-deploy-pack.zip`; a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'Deploy pack downloaded', description: 'Zip includes index.html and README.md. Deploy the folder to any static host.' })
  }
  const copyTemplate = async (tpl: WebsiteTemplate) => {
    try { await navigator.clipboard.writeText(buildTemplate(tpl)); toast({ title: 'Template copied', description: 'HTML copied to clipboard.' }) }
    catch { toast({ title: 'Copy failed', description: 'Could not copy to clipboard.', variant: 'error' }) }
  }

  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiHtml, setAiHtml] = useState<string | null>(null)
  const generateWebsite = async () => {
    const prompt = aiPrompt.trim()
    if (prompt.length < 10) { toast({ title: 'Prompt too short', description: 'Describe the website you want (at least 10 characters).', variant: 'error' }); return }
    if (!tenantId) return
    setAiGenerating(true)
    try {
      const supabase = requireSupabase()
      const { data, error } = await supabase.functions.invoke('website-generate', {
        body: { tenant_id: tenantId, prompt, business_name: templateData.businessName, phone: templateData.phone, email: templateData.email },
      })
      if (error) throw error
      const html = (data as { html?: string } | null)?.html
      if (!html || typeof html !== 'string') throw new Error('AI did not return a website HTML document.')
      setAiHtml(html)
      toast({ title: 'Website generated', description: 'Preview your generated website below. You can download or copy it.' })
    } catch (e) {
      toast({ title: 'AI generation unavailable', description: getErrorMessage(e) || 'Deploy the website-generate Edge Function and configure server-side AI provider secrets.', variant: 'error' })
    } finally { setAiGenerating(false) }
  }
  const downloadAiHtml = () => {
    if (!aiHtml) return
    const blob = new Blob([aiHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'ai-website.html'; a.click(); URL.revokeObjectURL(url)
  }
  const downloadAiZip = () => {
    if (!aiHtml) return
    const blob = makeZip([{ name: 'index.html', content: aiHtml }, { name: 'README.md', content: `# AI Generated Website\n\nGenerated from FlowSuite prompt.\n\nDeploy the folder as a static site (Netlify Drop/Vercel/GitHub Pages). Keep index.html at root.\n` }])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'ai-website-deploy-pack.zip'; a.click(); URL.revokeObjectURL(url)
  }

  if (!tenantId) return <ErrorState message="Select a business to manage its website records." />

  const sites = sitesQuery.data ?? []
  const siteOptions: SiteOption[] = sites.map(({ id, name, slug }) => ({ id, name, slug }))
  const siteNames = new Map(sites.map((site) => [site.id, site.name]))
  const submissions = submissionsQuery.data ?? []
  const refetch = () => {
    void sitesQuery.refetch()
    void submissionsQuery.refetch()
  }

  async function handleDeleteSite(site: GrowthSiteRow) {
    if (!canManage || !window.confirm(`Delete “${site.name}” and its recorded submissions? This cannot be undone.`)) return
    try {
      await deleteSite.mutateAsync(site.id)
      toast({ title: 'Website record deleted' })
    } catch (error) {
      toast({ title: 'Could not delete website', description: getErrorMessage(error), variant: 'error' })
    }
  }

  async function handleSubmissionStatus(item: GrowthSubmissionRow, value: string) {
    const parsed = submissionUpdateSchema.safeParse({ submission_id: item.id, status: value })
    if (!parsed.success) {
      toast({ title: 'Invalid status', description: parsed.error.issues[0]?.message, variant: 'error' })
      return
    }
    try {
      await updateSubmission.mutateAsync({ id: item.id, status: parsed.data.status })
      toast({ title: 'Submission updated' })
    } catch (error) {
      toast({ title: 'Could not update submission', description: getErrorMessage(error), variant: 'error' })
    }
  }

  async function handleDeleteSubmission(item: GrowthSubmissionRow) {
    if (!canManage || !window.confirm(`Delete the submission from ${item.full_name}? This cannot be undone.`)) return
    try {
      await deleteSubmission.mutateAsync(item.id)
      toast({ title: 'Submission deleted' })
    } catch (error) {
      toast({ title: 'Could not delete submission', description: getErrorMessage(error), variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Websites</h1>
          <p className="mt-1 text-sm text-ink-500">
            Internal page records and form leads entered by your team. No site is hosted and no domain is provisioned.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setDefaultWebsiteId(sites[0]?.id); setSubmissionOpen(true) }}
            disabled={sites.length === 0}
          >
            <Plus className="size-4" /> Record submission
          </Button>
          <Button size="sm" onClick={() => { setEditingSite(null); setSiteOpen(true) }}>
            <Plus className="size-4" /> New website
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-brand-600" /> AI Website Builder</CardTitle>
          <CardDescription>Describe the website you want, like you would to ChatGPT/Claude. Generates a static HTML website (requires deployed <code>website-generate</code> Edge Function and server-side AI provider config).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={4} placeholder="Example: Build a modern dental clinic website for Demo Dental Clinic with hero, services, testimonials, FAQ, and a contact form. Use teal colors and a professional tone." />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void generateWebsite()} loading={aiGenerating}><Sparkles className="size-4" /> Generate website</Button>
            {aiHtml ? <Button variant="outline" onClick={downloadAiHtml}><Download className="size-4" /> Download HTML</Button> : null}
            {aiHtml ? <Button variant="outline" onClick={downloadAiZip}><Package className="size-4" /> Deploy pack (.zip)</Button> : null}
            {aiHtml ? <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(aiHtml); toast({ title: 'Copied' }) }}><Copy className="size-4" /> Copy HTML</Button> : null}
          </div>
          {aiHtml ? <iframe title="AI generated website preview" srcDoc={aiHtml} className="h-[420px] w-full rounded-lg border border-ink-200 bg-white" /> : null}
          <p className="text-xs text-ink-500">No AI provider is configured by this change. If generation is unavailable, deploy <code>supabase/functions/website-generate</code> and set server-side AI secrets with explicit approval.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>AI website templates</CardTitle>
              <CardDescription>Choose a template, customize it, preview, download HTML/copy, or download a deploy-ready zip. FlowSuite does not host custom website files yet.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCustomizeOpen(true)}><Settings2 className="size-4" /> Customize</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {websiteTemplates.map((tpl) => (
              <div key={tpl.id} className="rounded-xl border border-ink-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">{tpl.name}</p>
                    <p className="mt-1 text-xs text-ink-500">{tpl.description}</p>
                  </div>
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tpl.accent }} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPreviewTemplate(tpl)}><Eye className="size-4" /> Preview</Button>
                  <Button size="sm" variant="outline" onClick={() => downloadTemplate(tpl)}><Download className="size-4" /> HTML</Button>
                  <Button size="sm" variant="outline" onClick={() => void copyTemplate(tpl)}><Copy className="size-4" /> Copy</Button>
                  <Button size="sm" variant="outline" onClick={() => downloadDeployPack(tpl)}><Package className="size-4" /> Zip</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeployTemplate(tpl)}><Rocket className="size-4" /> Deploy</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {sitesQuery.isLoading || submissionsQuery.isLoading ? (
        <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : sitesQuery.isError || submissionsQuery.isError ? (
        <ErrorState message={getErrorMessage(sitesQuery.error ?? submissionsQuery.error)} onRetry={refetch} />
      ) : sites.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Globe className="size-5" />}
            title="No website records yet"
            description="Add a page record first. This does not create a live website."
            action={<Button size="sm" onClick={() => setSiteOpen(true)}><Plus className="size-4" /> New website</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sites.map((site) => (
            <Card key={site.id}>
              <CardContent className="space-y-3 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900">{site.name}</p>
                    <p className="mt-0.5 text-xs text-ink-500">/{site.slug}{site.domain ? ` · ${site.domain}` : ''}</p>
                  </div>
                  <Badge variant={statusVariant(site.status)}>{siteStatusLabel(site.status)}</Badge>
                </div>
                {site.notes ? <p className="text-xs italic text-ink-500">{site.notes}</p> : null}
                <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
                  <Button variant="ghost" size="sm" onClick={() => { setDefaultWebsiteId(site.id); setSubmissionOpen(true) }}>
                    <Plus className="size-4" /> Submission
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingSite(site); setSiteOpen(true) }}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  {canManage ? (
                    <Button variant="ghost" size="sm" onClick={() => void handleDeleteSite(site)}>
                      <Trash2 className="size-4 text-red-600" /> Delete
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Form submissions</CardTitle>
          <CardDescription>Recorded from other channels. No hosted form or provider inbox exists.</CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <p className="text-sm text-ink-500">No submissions recorded yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {submissions.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {item.full_name} <span className="font-normal text-ink-500">· {item.email}</span>
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {siteNames.get(item.website_id) ?? 'Website'} · {formatDate(item.created_at)}
                      {item.message ? ` · ${item.message}` : ''}
                    </p>
                  </div>
                  <Badge variant={statusVariant(item.status)}>{submissionStatusLabel(item.status)}</Badge>
                  <Select
                    aria-label={`Change status for ${item.full_name}`}
                    className="h-8 w-32 px-2 text-xs"
                    value={item.status}
                    onChange={(event) => void handleSubmissionStatus(item, event.target.value)}
                  >
                    {submissionStatuses.map((status) => (
                      <option key={status} value={status}>{submissionStatusLabel(status)}</option>
                    ))}
                  </Select>
                  {canManage ? (
                    <Button variant="ghost" size="sm" onClick={() => void handleDeleteSubmission(item)} aria-label={`Delete submission from ${item.full_name}`}>
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {siteOpen ? (
        <SiteFormModal
          key={editingSite?.id ?? 'new'}
          open
          onClose={() => { setSiteOpen(false); setEditingSite(null) }}
          tenantId={tenantId}
          initial={editingSite}
          onSaved={refetch}
        />
      ) : null}

      {submissionOpen && sites.length > 0 ? (
        <SubmissionFormModal
          key={defaultWebsiteId ?? 'first'}
          open
          onClose={() => setSubmissionOpen(false)}
          tenantId={tenantId}
          websites={siteOptions}
          defaultWebsiteId={defaultWebsiteId}
          onSaved={refetch}
        />
      ) : null}

      <Modal open={Boolean(previewTemplate)} onClose={() => setPreviewTemplate(null)} title={previewTemplate?.name ?? 'Template preview'} description="Preview uses your current customization. Download HTML or a deploy-ready zip.">
        {previewTemplate ? (
          <div className="space-y-3">
            <iframe title="Template preview" srcDoc={buildTemplate(previewTemplate)} className="h-[420px] w-full rounded-lg border border-ink-200 bg-white" />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => void copyTemplate(previewTemplate)}><Copy className="size-4" /> Copy HTML</Button>
              <Button variant="outline" onClick={() => downloadTemplate(previewTemplate)}><Download className="size-4" /> HTML</Button>
              <Button onClick={() => downloadDeployPack(previewTemplate)}><Package className="size-4" /> Deploy pack (.zip)</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(deployTemplate)} onClose={() => setDeployTemplate(null)} title="Deploy website template" description="FlowSuite does not host custom website files yet. Download a deploy-ready pack and host it externally.">
        {deployTemplate ? (
          <div className="space-y-4 text-sm text-ink-700">
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-3"><p className="font-semibold text-ink-900">Option A - Netlify Drop (quick)</p><p className="mt-1 text-ink-600">Download the deploy pack, unzip, and drag-drop the folder into Netlify Drop. <code>index.html</code> is included.</p></div>
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-3"><p className="font-semibold text-ink-900">Option B - Vercel / GitHub Pages</p><p className="mt-1 text-ink-600">Push the unzipped folder to a repo or import into Vercel as a static site. No build step required.</p></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900"><p className="font-semibold">Inside FlowSuite now</p><p className="mt-1">Use this Websites section for records/submissions and the public Booking page at <code>/book/:slug</code>. Custom file hosting inside FlowSuite is not configured.</p></div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setDeployTemplate(null)}>Close</Button>
              <Button variant="outline" onClick={() => downloadTemplate(deployTemplate)}><Download className="size-4" /> HTML</Button>
              <Button onClick={() => downloadDeployPack(deployTemplate)}><Package className="size-4" /> Deploy pack (.zip)</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={customizeOpen} onClose={() => setCustomizeOpen(false)} title="Customize website template" description="These values are used for preview, download, copy, and deploy pack. They are not saved to the database.">
        <div className="space-y-4">
          <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Headline</span><Input value={custom.headline} onChange={(e) => setCustom((c) => ({ ...c, headline: e.target.value }))} placeholder="Healthy smiles at your clinic" /></label>
          <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Subheadline</span><Textarea value={custom.subheadline} onChange={(e) => setCustom((c) => ({ ...c, subheadline: e.target.value }))} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">CTA button text</span><Input value={custom.ctaText} onChange={(e) => setCustom((c) => ({ ...c, ctaText: e.target.value }))} /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 rounded-lg border border-ink-100 p-3"><p className="text-xs font-semibold text-ink-700">Service 1</p><Input value={custom.s1n} onChange={(e) => setCustom((c) => ({ ...c, s1n: e.target.value }))} placeholder="Name" /><Input value={custom.s1p} onChange={(e) => setCustom((c) => ({ ...c, s1p: e.target.value }))} placeholder="Price" /><Input value={custom.s1d} onChange={(e) => setCustom((c) => ({ ...c, s1d: e.target.value }))} placeholder="Description" /></div>
            <div className="space-y-2 rounded-lg border border-ink-100 p-3"><p className="text-xs font-semibold text-ink-700">Service 2</p><Input value={custom.s2n} onChange={(e) => setCustom((c) => ({ ...c, s2n: e.target.value }))} placeholder="Name" /><Input value={custom.s2p} onChange={(e) => setCustom((c) => ({ ...c, s2p: e.target.value }))} placeholder="Price" /><Input value={custom.s2d} onChange={(e) => setCustom((c) => ({ ...c, s2d: e.target.value }))} placeholder="Description" /></div>
            <div className="space-y-2 rounded-lg border border-ink-100 p-3"><p className="text-xs font-semibold text-ink-700">Service 3</p><Input value={custom.s3n} onChange={(e) => setCustom((c) => ({ ...c, s3n: e.target.value }))} placeholder="Name" /><Input value={custom.s3p} onChange={(e) => setCustom((c) => ({ ...c, s3p: e.target.value }))} placeholder="Price" /><Input value={custom.s3d} onChange={(e) => setCustom((c) => ({ ...c, s3d: e.target.value }))} placeholder="Description" /></div>
          </div>
          <div className="flex justify-end"><Button onClick={() => { setCustomizeOpen(false); toast({ title: 'Customization applied', description: 'Preview/download will use these values.' }) }}>Apply</Button></div>
        </div>
      </Modal>
    </div>
  )
}
