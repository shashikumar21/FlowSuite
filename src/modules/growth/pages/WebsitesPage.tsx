import { useState } from 'react'
import { Copy, Download, Eye, Globe, Pencil, Plus, Rocket, Trash2 } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import type { GrowthSiteRow, GrowthSubmissionRow } from '@/types/database'
import { SiteFormModal } from '../components/SiteFormModal'
import { SubmissionFormModal } from '../components/SubmissionFormModal'
import { websiteTemplates, type WebsiteTemplate } from '../websiteTemplates'
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

  const templateData = {
    businessName: activeTenant?.businesses?.name ?? 'Your Business',
    phone: activeTenant?.businesses?.phone ?? '',
    email: activeTenant?.businesses?.email ?? '',
  }
  const buildTemplate = (tpl: WebsiteTemplate) => tpl.build(templateData)
  const downloadTemplate = (tpl: WebsiteTemplate) => {
    const html = buildTemplate(tpl)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tpl.id}.html`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'Template downloaded', description: `${tpl.id}.html saved. You can deploy it to Netlify, Vercel, or any static host.` })
  }
  const copyTemplate = async (tpl: WebsiteTemplate) => {
    try {
      await navigator.clipboard.writeText(buildTemplate(tpl))
      toast({ title: 'Template copied', description: 'HTML copied to clipboard.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy to clipboard.', variant: 'error' })
    }
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
          <CardTitle>AI website templates</CardTitle>
          <CardDescription>Choose a template, preview it, download/copy the HTML, or follow deploy steps. These are static starter files - FlowSuite does not host custom website files yet.</CardDescription>
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
                  <Button size="sm" variant="outline" onClick={() => downloadTemplate(tpl)}><Download className="size-4" /> Download</Button>
                  <Button size="sm" variant="outline" onClick={() => void copyTemplate(tpl)}><Copy className="size-4" /> Copy</Button>
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

      <Modal open={Boolean(previewTemplate)} onClose={() => setPreviewTemplate(null)} title={previewTemplate?.name ?? 'Template preview'} description="Preview of the static HTML template. Download or copy to use it.">
        {previewTemplate ? (
          <div className="space-y-3">
            <iframe title="Template preview" srcDoc={buildTemplate(previewTemplate)} className="h-[420px] w-full rounded-lg border border-ink-200 bg-white" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => void copyTemplate(previewTemplate)}><Copy className="size-4" /> Copy HTML</Button>
              <Button onClick={() => downloadTemplate(previewTemplate)}><Download className="size-4" /> Download HTML</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(deployTemplate)} onClose={() => setDeployTemplate(null)} title="Deploy website template" description="FlowSuite does not host custom website files yet. Download the HTML and deploy it with a static host.">
        {deployTemplate ? (
          <div className="space-y-4 text-sm text-ink-700">
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
              <p className="font-semibold text-ink-900">Option A - Netlify Drop (quick)</p>
              <p className="mt-1 text-ink-600">Download the HTML, rename it to <code>index.html</code> if needed, then drag-drop the folder/file in Netlify Drop.</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
              <p className="font-semibold text-ink-900">Option B - Vercel / GitHub Pages</p>
              <p className="mt-1 text-ink-600">Put the HTML file in a repo/folder as <code>index.html</code> and deploy as a static site. No build step required.</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="font-semibold">Inside FlowSuite now</p>
              <p className="mt-1">You can store website records and submissions in this section, and use the public Booking page at <code>/book/:slug</code>. Custom file hosting/deploy inside FlowSuite is not configured.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeployTemplate(null)}>Close</Button>
              <Button onClick={() => downloadTemplate(deployTemplate)}><Download className="size-4" /> Download {deployTemplate.name}</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
