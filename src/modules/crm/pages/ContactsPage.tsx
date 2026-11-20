import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download, FileSpreadsheet, History, Upload } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton, Avatar } from '@/components/ui/Feedback'
import { Input, Label, Select } from '@/components/ui/Input'
import { Search, UserPlus } from 'lucide-react'
import { fetchContacts } from '../api'
import { crmKeys, useCrmInvalidate, useCrmOptions } from '../hooks'
import { ContactStatusBadge, LeadStatusBadge } from '../components/StatusBadges'
import { ContactFormModal } from '../components/ContactFormModal'
import { ContactDetailModal } from '../components/ContactDetailModal'
import { DealFormModal } from '../components/DealFormModal'
import { contactStatuses, leadStatuses } from '../schemas'
import { ImportWizard } from '../components/ImportWizard'
import { exportRows, fetchImportOptions } from '../data-exchange/api'
import { downloadCsv } from '../data-exchange/csv'
import { downloadSampleTemplate } from '../data-exchange/parse'
import type { ImportKind } from '../data-exchange/types'
import { formatDate } from '@/lib/format'
import type { ContactRow } from '@/types/database'

const PAGE_SIZE = 20

export function ContactsPage() {
  const { user } = useAuth()
  const { activeTenant, can } = useTenant()
  const { toast } = useToast()
  const tenantId = activeTenant?.tenant_id
  const currency = activeTenant?.businesses?.currency ?? 'INR'
  const invalidate = useCrmInvalidate(tenantId)
  const canManagePipeline = can('manage_pipeline')
  const currentUserId = user?.id ?? ''

  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [leadStatus, setLeadStatus] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [tagId, setTagId] = useState('')
  const [page, setPage] = useState(0)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ContactRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [convertId, setConvertId] = useState<string | null>(null)
  const [wizardKind, setWizardKind] = useState<ImportKind | null>(null)
  const [exportKind, setExportKind] = useState<ImportKind>('contacts')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput)
      setPage(0)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const optionsQuery = useCrmOptions(tenantId)
  const options = optionsQuery.data

  const filters = { query, status, leadStatus, sourceId, assignedTo, tagId, page }
  const contactsQuery = useQuery({
    queryKey: [...crmKeys.contacts(tenantId ?? ''), filters],
    enabled: Boolean(tenantId),
    queryFn: () =>
      fetchContacts(tenantId as string, {
        query,
        status: status || undefined,
        leadStatus: leadStatus || undefined,
        sourceId: sourceId || undefined,
        assignedTo: assignedTo || undefined,
        tagId: tagId || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  })

  const rows = contactsQuery.data?.rows ?? []
  const total = contactsQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const resetFilters = () => {
    setSearchInput('')
    setQuery('')
    setStatus('')
    setLeadStatus('')
    setSourceId('')
    setAssignedTo('')
    setTagId('')
    setPage(0)
  }

  const handleTemplate = async () => {
    if (!tenantId) return
    try {
      const importOptions = await fetchImportOptions(tenantId)
      await downloadSampleTemplate(importOptions.customFields)
    } catch (cause) {
      toast({
        title: 'Template unavailable',
        description: cause instanceof Error ? cause.message : 'Could not build the template.',
        variant: 'error',
      })
    }
  }

  /** Export uses the same filters as the list, and only rows RLS lets us see. */
  const handleExport = async () => {
    if (!tenantId || exporting) return
    setExporting(true)
    try {
      const [rows, importOptions] = await Promise.all([
        exportRows(tenantId, exportKind, {
          query,
          status: status || undefined,
          leadStatus: leadStatus || undefined,
          sourceId: sourceId || undefined,
          assignedTo: assignedTo || undefined,
          tagId: tagId || undefined,
        }),
        fetchImportOptions(tenantId),
      ])
      const customFields = importOptions.customFields.filter(
        (field) => field.entity_type === 'contact',
      )
      const headers = [
        'First name', 'Last name', 'Email', 'Phone', 'Company', 'Status',
        'Lead status', 'Source', 'Owner', 'Tags', 'Notes', 'Created at',
        ...customFields.map((field) => `Custom: ${field.label}`),
      ]
      const csvRows = rows.map((row) => [
        row.first_name,
        row.last_name,
        row.email,
        row.phone,
        row.company,
        row.status,
        row.lead_status,
        row.source_name,
        row.owner_name,
        row.tags,
        row.notes,
        row.created_at,
        ...customFields.map((field) => {
          const value = row.custom_data?.[field.key]
          return value === null || value === undefined ? '' : String(value)
        }),
      ])
      downloadCsv(`flowsuite-${exportKind}-${new Date().toISOString().slice(0, 10)}.csv`, [
        headers,
        ...csvRows,
      ])
      toast({ title: 'Export ready', description: `${rows.length} row(s) exported.` })
    } catch (cause) {
      toast({
        title: 'Export failed',
        description: cause instanceof Error ? cause.message : 'Could not export rows.',
        variant: 'error',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Customers</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Contacts & leads</h1>
          <p className="mt-1 text-sm text-ink-500">
            Every record is tenant-scoped. Employees see their assigned contacts and unassigned leads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!canManagePipeline}
            title={canManagePipeline ? 'Import contacts from Excel or CSV' : 'Only managers can import records'}
            onClick={() => setWizardKind('contacts')}
          >
            <Upload className="size-4" /> Import contacts
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canManagePipeline}
            title={canManagePipeline ? 'Import leads from Excel or CSV' : 'Only managers can import records'}
            onClick={() => setWizardKind('leads')}
          >
            <Upload className="size-4" /> Import leads
          </Button>
          <Select
            aria-label="Export record type"
            className="h-8 w-auto text-xs"
            value={exportKind}
            onChange={(event) => setExportKind(event.target.value as ImportKind)}
          >
            <option value="contacts">Contacts</option>
            <option value="leads">Leads</option>
          </Select>
          <Button size="sm" variant="outline" loading={exporting} onClick={() => { void handleExport() }}>
            <Download className="size-4" /> Export
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { void handleTemplate() }}>
            <FileSpreadsheet className="size-4" /> Sample template
          </Button>
          {canManagePipeline ? (
            <Link to="/app/crm/imports" className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-ink-700 hover:bg-ink-100">
              <History className="size-4" /> History
            </Link>
          ) : null}
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
            <UserPlus className="size-4" /> Add lead
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="sm:col-span-2 xl:col-span-2">
              <Label htmlFor="contact-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                <Input
                  id="contact-search"
                  className="pl-9"
                  placeholder="Name, email, phone, company"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="filter-status">Status</Label>
              <Select id="filter-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}>
                <option value="">All</option>
                {contactStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-lead-status">Lead stage</Label>
              <Select id="filter-lead-status" value={leadStatus} onChange={(event) => { setLeadStatus(event.target.value); setPage(0) }}>
                <option value="">All</option>
                {leadStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-source">Source</Label>
              <Select id="filter-source" value={sourceId} onChange={(event) => { setSourceId(event.target.value); setPage(0) }}>
                <option value="">All</option>
                {options?.sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-owner">Owner</Label>
              <Select id="filter-owner" value={assignedTo} onChange={(event) => { setAssignedTo(event.target.value); setPage(0) }}>
                <option value="">All</option>
                {options?.members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>{member.full_name ?? member.user_id}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-tag">Tag</Label>
              <Select id="filter-tag" value={tagId} onChange={(event) => { setTagId(event.target.value); setPage(0) }}>
                <option value="">All</option>
                {options?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </Select>
            </div>
          </div>
          {query || status || leadStatus || sourceId || assignedTo || tagId ? (
            <Button type="button" size="sm" variant="ghost" onClick={resetFilters}>Clear filters</Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0 py-0">
          {contactsQuery.isLoading || optionsQuery.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-12" />)}</div>
          ) : contactsQuery.isError || optionsQuery.isError ? (
            <ErrorState
              message="We couldn't load contacts for this business."
              onRetry={() => { void contactsQuery.refetch(); void optionsQuery.refetch() }}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="size-5" />}
              title={query || status || leadStatus || sourceId || assignedTo || tagId ? 'No matching contacts' : 'No contacts yet'}
              description={query || status || leadStatus || sourceId || assignedTo || tagId ? 'Try a different search or clear the filters.' : 'Add your first lead to start building your pipeline.'}
              action={!query && !status && !leadStatus && !sourceId && !assignedTo && !tagId ? (
                <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>Add lead</Button>
              ) : undefined}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Name</th>
                      <th className="px-3 py-3 font-semibold">Contact</th>
                      <th className="px-3 py-3 font-semibold">Company</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Lead stage</th>
                      <th className="px-3 py-3 font-semibold">Owner</th>
                      <th className="px-5 py-3 font-semibold">Added</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.map((contact) => (
                      <tr
                        key={contact.id}
                        tabIndex={0}
                        onClick={() => setDetailId(contact.id)}
                        onKeyDown={(event) => { if (event.key === 'Enter') setDetailId(contact.id) }}
                        className="cursor-pointer transition hover:bg-ink-50 focus:bg-ink-50 focus:outline-none"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={`${contact.first_name} ${contact.last_name ?? ''}`} className="size-8" />
                            <span className="font-semibold text-ink-900">{contact.first_name} {contact.last_name ?? ''}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-ink-600">{contact.email ?? contact.phone ?? '—'}</td>
                        <td className="px-3 py-3 text-ink-600">{contact.company ?? '—'}</td>
                        <td className="px-3 py-3"><ContactStatusBadge status={contact.status} /></td>
                        <td className="px-3 py-3"><LeadStatusBadge status={contact.lead_status} /></td>
                        <td className="px-3 py-3 text-ink-600">
                          {options?.members.find((member) => member.user_id === contact.assigned_to)?.full_name ?? (
                            <Badge variant="warning">Unassigned</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs text-ink-500">{formatDate(contact.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="divide-y divide-ink-100 md:hidden">
                {rows.map((contact) => (
                  <li key={contact.id}>
                    <button type="button" onClick={() => setDetailId(contact.id)} className="w-full px-5 py-4 text-left">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${contact.first_name} ${contact.last_name ?? ''}`} className="size-9" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink-900">{contact.first_name} {contact.last_name ?? ''}</p>
                          <p className="truncate text-xs text-ink-500">{contact.company ?? contact.email ?? contact.phone ?? 'No details'}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <ContactStatusBadge status={contact.status} />
                        <LeadStatusBadge status={contact.lead_status} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-3 border-t border-ink-100 px-5 py-4 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
                <span>{total} contact{total === 1 ? '' : 's'} · page {page + 1} of {pageCount}</span>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button>
                  <Button type="button" size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ContactFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tenantId={tenantId ?? ''}
        sources={options?.sources ?? []}
        members={options?.members ?? []}
        currentUserId={currentUserId}
        canAssign={canManagePipeline}
        contact={editing}
        onSaved={invalidate}
      />

      <ContactDetailModal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        tenantId={tenantId ?? ''}
        contactId={detailId}
        options={options ?? { sources: [], tags: [], pipelines: [], stages: [], members: [] }}
        currentUserId={currentUserId}
        canManagePipeline={canManagePipeline}
        onEdit={(contact) => { setDetailId(null); setEditing(contact); setFormOpen(true) }}
        onConvert={(id) => { setDetailId(null); setConvertId(id) }}
        onChanged={invalidate}
      />

      <DealFormModal
        open={Boolean(convertId)}
        onClose={() => setConvertId(null)}
        tenantId={tenantId ?? ''}
        options={options ?? { sources: [], tags: [], pipelines: [], stages: [], members: [] }}
        contacts={[]}
        currency={currency}
        currentUserId={currentUserId}
        canAssign={canManagePipeline}
        mode="convert"
        convertContactId={convertId ?? undefined}
        onSaved={invalidate}
      />

      <ImportWizard
        open={wizardKind !== null}
        onClose={() => setWizardKind(null)}
        tenantId={tenantId ?? ''}
        kind={wizardKind ?? 'contacts'}
        onComplete={invalidate}
      />
    </div>
  )
}
