import { useMemo, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Plus, Search, Upload } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Input, Label, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { parseWorkbook } from '@/modules/crm/data-exchange/parse'
import type { ProspectRow, SalesImportResult, SalesLeadStatus } from '@/types/database'
import { deleteProspect, importProspects, setProspectLeadStatus } from '../api'
import { useProspects, useSalesAgentInvalidate, useSalesMembers } from '../hooks'
import { leadStatusOptions, verificationStatusOptions } from '../schemas'
import { IMPORT_TEMPLATE_HEADERS, mapImportSheet } from '../utils'
import { LeadStatusBadge, VerificationStatusBadge } from '../components/StatusBadges'
import { ProspectFormModal } from '../components/ProspectFormModal'

const EMPTY_PROSPECTS: ProspectRow[] = []

function downloadTemplate(): void {
  const example = [
    'Smile Dental Clinic', 'Dental', 'Mumbai', 'Maharashtra', 'India',
    'example.com', '1-10', 'Dr. Sharma', 'hello@example.com', '9876543210', 'Referred by a patient',
  ]
  const content = '\uFEFF' + [IMPORT_TEMPLATE_HEADERS, example].map((row) => row.join(',')).join('\r\n') + '\r\n'
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'sales-agent-prospects-template.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function ProspectsPage() {
  const { user } = useAuth()
  const { activeTenant, can } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const { toast } = useToast()
  const prospectsQuery = useProspects(tenantId)
  const membersQuery = useSalesMembers(tenantId)
  const invalidate = useSalesAgentInvalidate(tenantId)

  const [query, setQuery] = useState('')
  const [leadFilter, setLeadFilter] = useState('')
  const [verificationFilter, setVerificationFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProspectRow | null>(null)
  const [deleting, setDeleting] = useState<ProspectRow | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [importResult, setImportResult] = useState<SalesImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const prospects = prospectsQuery.data ?? EMPTY_PROSPECTS
  const members = membersQuery.data ?? []
  const canManage = can('manage_sales_agent')
  const currentUserId = user?.id ?? ''

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return prospects.filter((prospect) => {
      if (leadFilter && prospect.lead_status !== leadFilter) return false
      if (verificationFilter && prospect.verification_status !== verificationFilter) return false
      if (!needle) return true
      return [prospect.business_name, prospect.industry, prospect.city, prospect.email, prospect.contact_person]
        .some((value) => (value ?? '').toLowerCase().includes(needle))
    })
  }, [prospects, query, leadFilter, verificationFilter])

  if (!tenantId) {
    return <ErrorState message="Select a business to manage its prospects." />
  }

  async function handleStatus(prospect: ProspectRow, status: SalesLeadStatus) {
    try {
      await setProspectLeadStatus(tenantId as string, prospect.id, status)
      toast({ title: 'Prospect status updated' })
      invalidate()
    } catch (error) {
      toast({ title: 'Could not update status', description: getErrorMessage(error), variant: 'error' })
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await deleteProspect(tenantId as string, deleting.id)
      toast({ title: 'Prospect deleted' })
      setDeleting(null)
      invalidate()
    } catch (error) {
      toast({ title: 'Could not delete prospect', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setDeletingBusy(false)
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const workbook = await parseWorkbook(file)
      const sheet = workbook.sheets[0]
      if (!sheet) throw new Error('The file has no worksheet with a header row and data.')
      const mapped = mapImportSheet(sheet.rows, sheet.headerRowIndex)
      if (mapped.rows.length === 0) {
        throw new Error('No rows with a business name were found. Check the column headings.')
      }
      const result = await importProspects(tenantId as string, mapped.rows)
      setImportResult(result)
      toast({
        title: 'Import finished',
        description: `${result.created} created, ${result.skipped_duplicate} duplicate, ${result.failed} failed.`,
      })
      invalidate()
    } catch (error) {
      toast({ title: 'Import failed', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-900">Prospects</h1>
            <Badge variant="brand">NEW</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            Prospects are tracked here, separately from CRM contacts. Conversion arrives in a later phase.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button variant="outline" size="sm" loading={importing} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" /> Template
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" /> Add prospect
          </Button>
        </div>
      </header>

      {importResult ? (
        <Card className="border-brand-200 bg-brand-50/60">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink-900">
                Imported {importResult.total} row(s): {importResult.created} created,{' '}
                {importResult.skipped_duplicate} duplicate, {importResult.failed} failed.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setImportResult(null)}>Dismiss</Button>
            </div>
            {importResult.results.some((row) => row.status === 'failed') ? (
              <ul className="mt-3 space-y-1 text-xs text-red-700">
                {importResult.results
                  .filter((row) => row.status === 'failed')
                  .slice(0, 10)
                  .map((row) => (
                    <li key={row.row}>
                      Row {row.row + 1}: {row.reason ?? 'Validation failed'}
                    </li>
                  ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="sales-prospect-query">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                <Input
                  id="sales-prospect-query"
                  className="pl-9"
                  placeholder="Business, city, email or contact"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="sales-prospect-lead-filter">Lead status</Label>
              <Select id="sales-prospect-lead-filter" value={leadFilter} onChange={(event) => setLeadFilter(event.target.value)}>
                <option value="">All statuses</option>
                {leadStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="sales-prospect-verification-filter">Verification</Label>
              <Select
                id="sales-prospect-verification-filter"
                value={verificationFilter}
                onChange={(event) => setVerificationFilter(event.target.value)}
              >
                <option value="">All</option>
                {verificationStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>
          </div>

          {prospectsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}
            </div>
          ) : prospectsQuery.isError ? (
            <ErrorState message={getErrorMessage(prospectsQuery.error)} onRetry={() => void prospectsQuery.refetch()} />
          ) : prospects.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="size-5" />}
              title="No prospects yet"
              description="Add one manually or import a CSV/XLSX file. Imports skip duplicates in this business."
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="No matches" description="Try clearing a filter or changing your search." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                    <th className="py-2 pr-3 font-semibold">Business</th>
                    <th className="py-2 pr-3 font-semibold">Contact</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 pr-3 font-semibold">Verification</th>
                    <th className="py-2 pr-3 font-semibold">Added</th>
                    <th className="py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtered.map((prospect) => (
                    <tr key={prospect.id}>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-ink-900">{prospect.business_name}</p>
                        <p className="text-xs text-ink-500">
                          {[prospect.industry, prospect.city, prospect.country].filter(Boolean).join(' · ') || '—'}
                        </p>
                        <p className="text-[11px] text-ink-400">Source: {prospect.source}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <p className="text-ink-800">{prospect.contact_person ?? '—'}</p>
                        <p className="text-xs text-ink-500">{prospect.email ?? prospect.phone ?? '—'}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <LeadStatusBadge status={prospect.lead_status} />
                          <Select
                            aria-label={`Change status for ${prospect.business_name}`}
                            className="h-8 w-auto text-xs"
                            value={prospect.lead_status}
                            onChange={(event) => void handleStatus(prospect, event.target.value as SalesLeadStatus)}
                          >
                            {leadStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </Select>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <VerificationStatusBadge status={prospect.verification_status} />
                      </td>
                      <td className="py-3 pr-3 text-xs text-ink-500">{formatDate(prospect.created_at)}</td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(prospect)
                              setFormOpen(true)
                            }}
                          >
                            Edit
                          </Button>
                          {canManage ? (
                            <Button variant="ghost" size="sm" onClick={() => setDeleting(prospect)}>Delete</Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProspectFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tenantId={tenantId}
        currentUserId={currentUserId}
        members={members}
        prospect={editing}
        onSaved={invalidate}
      />

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete prospect"
        description={`Delete “${deleting?.business_name ?? ''}” from this business? This cannot be undone.`}
        className="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" loading={deletingBusy} onClick={() => void handleDelete()}>Delete</Button>
        </div>
      </Modal>
    </div>
  )
}
