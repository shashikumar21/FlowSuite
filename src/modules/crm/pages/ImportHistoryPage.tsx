import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, History, ShieldX } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { fetchImportHistory } from '../data-exchange/api'
import { downloadCsv, errorReportRows } from '../data-exchange/csv'
import type { ImportResultRow } from '../data-exchange/types'
import { formatDateTime } from '@/lib/format'

export function ImportHistoryPage() {
  const { activeTenant, can } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const allowed = can('manage_pipeline')

  const history = useQuery({
    queryKey: ['crm', tenantId ?? '', 'import-history'],
    enabled: Boolean(tenantId) && allowed,
    queryFn: () => fetchImportHistory(tenantId as string),
  })

  if (!allowed) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="py-12 text-center">
          <ShieldX className="mx-auto size-8 text-ink-400" />
          <h1 className="mt-3 text-lg font-semibold text-ink-900">Manager access required</h1>
          <p className="mt-1 text-sm text-ink-500">
            Import history is restricted to owners, admins and managers. The database enforces this too.
          </p>
          <Link to="/app/contacts" className="mt-4 inline-flex h-10 items-center rounded-lg border border-ink-300 px-4 text-sm font-semibold text-ink-800 hover:bg-ink-50">
            Back to contacts
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Customers</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Import history</h1>
        <p className="mt-1 text-sm text-ink-500">
          Audit trail for contact and lead imports in this business only.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Recent imports</CardTitle>
            <CardDescription>Up to 50 jobs, newest first.</CardDescription>
          </div>
          <Link to="/app/contacts" className="inline-flex h-8 items-center gap-2 rounded-lg border border-ink-300 px-3 text-xs font-semibold text-ink-800 hover:bg-ink-50">
            <ArrowLeft className="size-4" /> Contacts
          </Link>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-12" />)}</div>
          ) : history.isError ? (
            <ErrorState message="We couldn't load the import history." onRetry={() => { void history.refetch() }} />
          ) : (history.data ?? []).length === 0 ? (
            <EmptyState icon={<History className="size-5" />} title="No imports yet" description="Files imported from the Contacts page will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold">File</th>
                    <th className="px-3 py-3 font-semibold">Type</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Rows</th>
                    <th className="px-3 py-3 font-semibold">Result</th>
                    <th className="px-3 py-3 font-semibold">Started</th>
                    <th className="px-3 py-3 font-semibold">Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {(history.data ?? []).map((job) => (
                    <tr key={job.id} className="text-ink-700">
                      <td className="px-3 py-3 font-medium text-ink-900">{job.file_name}</td>
                      <td className="px-3 py-3 capitalize">{job.kind}</td>
                      <td className="px-3 py-3">
                        <Badge variant={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'warning'}>
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">{job.processed_rows} / {job.total_rows}</td>
                      <td className="px-3 py-3 text-xs">
                        +{job.created_count} · ~{job.updated_count} · skip {job.skipped_count} · fail {job.failed_count}
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-500">{formatDateTime(job.created_at)}</td>
                      <td className="px-3 py-3">
                        {job.error_report.length > 0 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadCsv(
                              `flowsuite-import-errors-${job.id}.csv`,
                              errorReportRows(job.error_report.map((row) => ({ ...row, status: row.status as ImportResultRow['status'] }))),
                            )}
                          >
                            <Download className="size-4" /> Errors
                          </Button>
                        ) : <span className="text-xs text-ink-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
