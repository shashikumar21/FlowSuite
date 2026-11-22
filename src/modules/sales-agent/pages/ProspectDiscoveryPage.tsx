import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Plus, Search } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import type { ProspectSearchRow } from '@/types/database'
import { useProspectSearches, useSalesAgentInvalidate } from '../hooks'
import { ProviderStatus } from '../components/ProviderStatus'
import { SavedSearchFormModal } from '../components/SavedSearchFormModal'

function criteriaSummary(criteria: ProspectSearchRow['criteria']): string {
  if (typeof criteria !== 'object' || criteria === null || Array.isArray(criteria)) return ''
  const values = criteria as Record<string, unknown>
  const parts = ['industry', 'city', 'state', 'country', 'business_size', 'keywords']
    .map((key) => (typeof values[key] === 'string' ? values[key] : ''))
    .filter((value): value is string => value.trim() !== '')
  return parts.join(' · ')
}

export function ProspectDiscoveryPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const searchesQuery = useProspectSearches(tenantId)
  const invalidate = useSalesAgentInvalidate(tenantId)
  const [editing, setEditing] = useState<ProspectSearchRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  if (!tenantId) {
    return <ErrorState message="Select a business to manage its saved searches." />
  }

  const searches = searchesQuery.data ?? []

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-900">Prospect discovery</h1>
            <Badge variant="brand">NEW</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            Save the criteria you want to use. Live business lookup is not connected yet.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="size-4" /> Save search
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader>
            <CardTitle className="text-amber-900">Manual mode only</CardTitle>
            <CardDescription className="text-amber-800">
              Saved searches store criteria. They do not run against an external provider and never invent results.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-amber-900">
              Once a discovery provider is configured server-side, these criteria can be used to find businesses.
              Until then, add prospects directly from the{' '}
              <Link to="/app/sales-agent/prospects" className="font-semibold underline">
                Prospects page <ArrowRight className="inline size-3.5" />
              </Link>
              .
            </p>
          </CardContent>
        </Card>
        <ProviderStatus />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saved searches</CardTitle>
          <CardDescription>All searches belong to this business.</CardDescription>
        </CardHeader>
        <CardContent>
          {searchesQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}
            </div>
          ) : searchesQuery.isError ? (
            <ErrorState message={getErrorMessage(searchesQuery.error)} onRetry={() => void searchesQuery.refetch()} />
          ) : searches.length === 0 ? (
            <EmptyState
              icon={<Search className="size-5" />}
              title="No saved searches yet"
              description="Save criteria now so a discovery provider can use them later."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {searches.map((search) => (
                <li key={search.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink-900">{search.name}</p>
                      <Badge variant="neutral">{search.provider}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {criteriaSummary(search.criteria) || 'No criteria recorded'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-400">Saved {formatDate(search.created_at)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(search)
                      setFormOpen(true)
                    }}
                  >
                    Edit
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <SavedSearchFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tenantId={tenantId}
        search={editing}
        onSaved={invalidate}
      />
    </div>
  )
}
