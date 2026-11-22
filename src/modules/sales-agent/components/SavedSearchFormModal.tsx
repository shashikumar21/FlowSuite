import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { ProspectSearchRow } from '@/types/database'
import { saveProspectSearch } from '../api'
import {
  emptySavedSearchForm,
  savedSearchSchema,
  type SavedSearchFormValues,
} from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  search: ProspectSearchRow | null
  onSaved: () => void
}

function toFormValues(search: ProspectSearchRow | null): SavedSearchFormValues {
  if (!search) return emptySavedSearchForm()
  const criteria = search.criteria
  const read = (key: string): string => {
    if (typeof criteria !== 'object' || criteria === null || Array.isArray(criteria)) return ''
    const value = (criteria as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : ''
  }
  return {
    name: search.name,
    industry: read('industry'),
    city: read('city'),
    state: read('state'),
    country: read('country'),
    business_size: read('business_size'),
    keywords: read('keywords'),
  }
}

export function SavedSearchFormModal({ open, onClose, tenantId, search, onSaved }: Props) {
  const { toast } = useToast()
  const form = useForm<SavedSearchFormValues>({
    resolver: zodResolver(savedSearchSchema),
    defaultValues: emptySavedSearchForm(),
  })

  useEffect(() => {
    if (open) form.reset(toFormValues(search))
  }, [open, search, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await saveProspectSearch(tenantId, values, search?.id ?? null)
      toast({
        title: search ? 'Search updated' : 'Search saved',
        description: 'Criteria are stored locally. No external provider was called.',
      })
      onSaved()
      onClose()
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error) })
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={search ? 'Edit saved search' : 'Save a search'}
      description="Define criteria now; a discovery provider can use them once configured."
      className="max-w-xl"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {form.formState.errors.root?.message ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {form.formState.errors.root.message}
          </p>
        ) : null}

        <div>
          <Label htmlFor="sales-search-name">Search name</Label>
          <Input id="sales-search-name" autoFocus {...form.register('name')} />
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sales-search-industry">Industry</Label>
            <Input id="sales-search-industry" {...form.register('industry')} />
          </div>
          <div>
            <Label htmlFor="sales-search-size">Business size</Label>
            <Input id="sales-search-size" {...form.register('business_size')} />
          </div>
          <div>
            <Label htmlFor="sales-search-city">City</Label>
            <Input id="sales-search-city" {...form.register('city')} />
          </div>
          <div>
            <Label htmlFor="sales-search-state">State</Label>
            <Input id="sales-search-state" {...form.register('state')} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="sales-search-country">Country</Label>
            <Input id="sales-search-country" {...form.register('country')} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="sales-search-keywords">Keywords</Label>
            <Textarea id="sales-search-keywords" placeholder="Optional terms to search for later…" {...form.register('keywords')} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>{search ? 'Save changes' : 'Save search'}</Button>
        </div>
      </form>
    </Modal>
  )
}
