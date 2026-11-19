import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Settings2, ShieldAlert, Trash2 } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import {
  createCustomField,
  createLeadSource,
  createPipeline,
  createPipelineStage,
  createTag,
  deleteCustomField,
  deleteLeadSource,
  deleteTag,
  fetchCrmSettings,
  setLeadSourceActive,
  type CrmSettings,
} from '../api'
import { useCrmInvalidate } from '../hooks'
import { stagesForPipeline } from '../utils'
import {
  customFieldSchema,
  customFieldTypes,
  pipelineSchema,
  sourceSchema,
  sourceTypes,
  stageSchema,
  tagSchema,
  type CustomFieldFormValues,
  type PipelineFormValues,
  type SourceFormValues,
  type StageFormInput,
  type StageFormValues,
  type TagFormValues,
} from '../schemas'
import type { CustomFieldRow, LeadSourceRow } from '@/types/database'

export function CrmSettingsPage() {
  const { activeTenant, can } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const { toast } = useToast()
  const invalidate = useCrmInvalidate(tenantId)
  const canManage = can('manage_pipeline')

  const settingsQuery = useQuery({
    queryKey: ['crm', tenantId ?? '', 'settings'],
    enabled: Boolean(tenantId) && canManage,
    queryFn: () => fetchCrmSettings(tenantId as string),
  })

  const settings = settingsQuery.data

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <Card>
          <CardContent className="px-8 py-10 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <ShieldAlert className="size-6" />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-900">CRM setup is manager-only</h1>
            <p className="mt-2 text-sm text-ink-500">
              Pipelines, stages, lead sources and tags change how this business works. Only owners, admins and managers
              can make these changes. The permission is enforced by database policies, not just this screen.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Customers</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">CRM setup</h1>
        <p className="mt-1 text-sm text-ink-500">
          Configure this business only. Changes here are available immediately to every member who can see the CRM.
        </p>
      </div>

      {settingsQuery.isError ? (
        <Card>
          <CardContent>
            <ErrorState message={getErrorMessage(settingsQuery.error)} onRetry={() => void settingsQuery.refetch()} />
          </CardContent>
        </Card>
      ) : null}

      {settingsQuery.isLoading || !settings ? (
        <Card><CardContent className="space-y-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-16" />)}</CardContent></Card>
      ) : (
        <>
          <PipelineSection tenantId={tenantId as string} settings={settings} onChanged={invalidate} toast={toast} />
          <div className="grid gap-6 lg:grid-cols-2">
            <SourceSection tenantId={tenantId as string} sources={settings.sources} onChanged={invalidate} toast={toast} />
            <TagSection tenantId={tenantId as string} tags={settings.tags} onChanged={invalidate} toast={toast} />
          </div>
          <CustomFieldSection
            tenantId={tenantId as string}
            fields={settings.customFields}
            onChanged={invalidate}
            toast={toast}
          />
        </>
      )}
    </div>
  )
}

type Toast = ReturnType<typeof useToast>['toast']

function ActionError({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
}

function PipelineSection({
  tenantId,
  settings,
  onChanged,
  toast,
}: {
  tenantId: string
  settings: CrmSettings
  onChanged: () => void
  toast: Toast
}) {
  const [error, setError] = useState<string | null>(null)
  const pipelineForm = useForm<PipelineFormValues>({
    resolver: zodResolver(pipelineSchema),
    defaultValues: { name: '', description: '', color: '#6366f1' },
  })
  const stageForm = useForm<StageFormInput, unknown, StageFormValues>({
    resolver: zodResolver(stageSchema),
    defaultValues: {
      name: '',
      probability: 0,
      is_closed: false,
      is_won: false,
      color: '#6366f1',
    },
  })
  const [pipelineForStage, setPipelineForStage] = useState(settings.pipelines[0]?.id ?? '')

  const run = async (label: string, action: () => Promise<unknown>, reset?: () => void) => {
    setError(null)
    try {
      await action()
      reset?.()
      onChanged()
      toast({ title: label })
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipelines & stages</CardTitle>
        <CardDescription>Deal stages belong to one pipeline. Drag-and-drop boards use these stages in this order.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ActionError message={error} />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-ink-200 p-4">
            <h3 className="text-sm font-semibold text-ink-900">Add a pipeline</h3>
            <form
              noValidate
              className="space-y-3"
              onSubmit={pipelineForm.handleSubmit((values) =>
                run('Pipeline created', () => createPipeline(tenantId, values), () =>
                  pipelineForm.reset({ name: '', description: '', color: '#6366f1' }),
                ),
              )}
            >
              <div>
                <Label htmlFor="new-pipeline-name">Name</Label>
                <Input id="new-pipeline-name" placeholder="e.g. Sales" {...pipelineForm.register('name')} />
                <FieldError>{pipelineForm.formState.errors.name?.message}</FieldError>
              </div>
              <div>
                <Label htmlFor="new-pipeline-desc">Description</Label>
                <Input id="new-pipeline-desc" placeholder="Optional" {...pipelineForm.register('description')} />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label htmlFor="new-pipeline-color">Colour</Label>
                  <Input id="new-pipeline-color" type="color" className="h-10 p-1" {...pipelineForm.register('color')} />
                </div>
                <Button type="submit" loading={pipelineForm.formState.isSubmitting}>
                  <Plus className="size-4" /> Add pipeline
                </Button>
              </div>
            </form>
          </div>

          <div className="space-y-3 rounded-lg border border-ink-200 p-4">
            <h3 className="text-sm font-semibold text-ink-900">Add a stage</h3>
            <form
              noValidate
              className="space-y-3"
              onSubmit={stageForm.handleSubmit((values) =>
                run('Stage created', () => createPipelineStage(tenantId, pipelineForStage, values), () =>
                  stageForm.reset({ name: '', probability: 0, is_closed: false, is_won: false, color: '#6366f1' }),
                ),
              )}
            >
              <div>
                <Label htmlFor="new-stage-pipeline">Pipeline</Label>
                <Select
                  id="new-stage-pipeline"
                  value={pipelineForStage}
                  onChange={(event) => setPipelineForStage(event.target.value)}
                >
                  {settings.pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="new-stage-name">Stage name</Label>
                  <Input id="new-stage-name" placeholder="e.g. Qualified" {...stageForm.register('name')} />
                  <FieldError>{stageForm.formState.errors.name?.message}</FieldError>
                </div>
                <div>
                  <Label htmlFor="new-stage-probability">Probability %</Label>
                  <Input id="new-stage-probability" type="number" min="0" max="100" {...stageForm.register('probability')} />
                  <FieldError>{stageForm.formState.errors.probability?.message}</FieldError>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" {...stageForm.register('is_closed')} /> Closed stage
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" {...stageForm.register('is_won')} /> Won stage
                </label>
                <Input type="color" aria-label="Stage colour" className="h-9 w-16 p-1" {...stageForm.register('color')} />
              </div>
              <Button type="submit" loading={stageForm.formState.isSubmitting} disabled={!pipelineForStage}>
                <Plus className="size-4" /> Add stage
              </Button>
            </form>
          </div>
        </div>

        <div className="space-y-3">
          {settings.pipelines.length === 0 ? (
            <EmptyState icon={<Settings2 className="size-5" />} title="No pipelines yet" description="Add one before creating stages." />
          ) : (
            settings.pipelines.map((pipeline) => {
              const stages = stagesForPipeline(settings.stages, pipeline.id)
              return (
                <div key={pipeline.id} className="rounded-lg border border-ink-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: pipeline.color ?? '#6366f1' }} />
                    <h3 className="text-sm font-semibold text-ink-900">{pipeline.name}</h3>
                    {pipeline.is_default ? <Badge variant="brand">Default</Badge> : null}
                    {!pipeline.is_active ? <Badge variant="neutral">Inactive</Badge> : null}
                    <span className="text-xs text-ink-500">{stages.length} stages</span>
                  </div>
                  {stages.length ? (
                    <ol className="mt-3 flex flex-wrap gap-2">
                      {stages.map((stage) => (
                        <li key={stage.id} className="rounded-md bg-ink-50 px-2.5 py-1.5 text-xs text-ink-700">
                          <span className="font-semibold">{stage.position + 1}.</span> {stage.name}
                          <span className="ml-1 text-ink-400">({stage.probability}%)</span>
                          {stage.is_won ? <span className="ml-1 text-emerald-600">won</span> : null}
                          {stage.is_closed && !stage.is_won ? <span className="ml-1 text-red-600">lost</span> : null}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-2 text-xs text-ink-500">No stages yet.</p>
                  )}
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SourceSection({
  tenantId,
  sources,
  onChanged,
  toast,
}: {
  tenantId: string
  sources: LeadSourceRow[]
  onChanged: () => void
  toast: Toast
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<SourceFormValues>({
    resolver: zodResolver(sourceSchema),
    defaultValues: { name: '', type: 'website' },
  })

  const run = async (label: string, action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      onChanged()
      toast({ title: label })
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead sources</CardTitle>
        <CardDescription>Track where enquiries come from. Inactive sources stay on existing contacts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActionError message={error} />
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-[1fr_140px_auto]"
          onSubmit={form.handleSubmit((values) =>
            run('Lead source added', async () => {
              await createLeadSource(tenantId, values)
              form.reset({ name: '', type: values.type })
            }),
          )}
        >
          <div>
            <Label htmlFor="new-source-name">Name</Label>
            <Input id="new-source-name" placeholder="e.g. Google Ads" {...form.register('name')} />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="new-source-type">Type</Label>
            <Select id="new-source-type" {...form.register('type')}>
              {sourceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" loading={form.formState.isSubmitting}><Plus className="size-4" /> Add</Button>
          </div>
        </form>

        {sources.length ? (
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
            {sources.map((source) => (
              <li key={source.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{source.name}</p>
                  <p className="text-xs text-ink-500">{source.type}</p>
                </div>
                {!source.active ? <Badge variant="neutral">Inactive</Badge> : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void run(source.active ? 'Source deactivated' : 'Source activated', () =>
                    setLeadSourceActive(tenantId, source.id, !source.active),
                  )}
                >
                  {source.active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${source.name}`}
                  onClick={() => void run('Lead source deleted', () => deleteLeadSource(tenantId, source.id))}
                >
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No lead sources" description="Add sources so you can report on where leads come from." />
        )}
      </CardContent>
    </Card>
  )
}

function TagSection({
  tenantId,
  tags,
  onChanged,
  toast,
}: {
  tenantId: string
  tags: CrmSettings['tags']
  onChanged: () => void
  toast: Toast
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagSchema),
    defaultValues: { name: '', color: '#8b5cf6' },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
        <CardDescription>Short labels for segmenting contacts, such as “VIP” or “Follow-up”.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActionError message={error} />
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-[1fr_72px_auto]"
          onSubmit={form.handleSubmit(async (values) => {
            setError(null)
            try {
              await createTag(tenantId, values.name, values.color)
              form.reset({ name: '', color: values.color })
              onChanged()
              toast({ title: 'Tag created' })
            } catch (cause) {
              setError(getErrorMessage(cause))
            }
          })}
        >
          <div>
            <Label htmlFor="new-tag-name">Name</Label>
            <Input id="new-tag-name" placeholder="e.g. VIP" {...form.register('name')} />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="new-tag-color">Colour</Label>
            <Input id="new-tag-color" type="color" className="h-10 p-1" {...form.register('color')} />
          </div>
          <div className="flex items-end">
            <Button type="submit" loading={form.formState.isSubmitting}><Plus className="size-4" /> Add</Button>
          </div>
        </form>

        {tags.length ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ backgroundColor: `${tag.color ?? '#8b5cf6'}20`, color: tag.color ?? '#8b5cf6' }}
              >
                {tag.name}
                <button
                  type="button"
                  aria-label={`Delete ${tag.name}`}
                  className="rounded-full p-0.5 hover:bg-white/60"
                  onClick={async () => {
                    setError(null)
                    try {
                      await deleteTag(tenantId, tag.id)
                      onChanged()
                      toast({ title: 'Tag deleted' })
                    } catch (cause) {
                      setError(getErrorMessage(cause))
                    }
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <EmptyState title="No tags" description="Add a tag, then open a contact to attach it." />
        )}
      </CardContent>
    </Card>
  )
}

function CustomFieldSection({
  tenantId,
  fields,
  onChanged,
  toast,
}: {
  tenantId: string
  fields: CustomFieldRow[]
  onChanged: () => void
  toast: Toast
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<CustomFieldFormValues>({
    resolver: zodResolver(customFieldSchema),
    defaultValues: { entity_type: 'contact', key: '', label: '', type: 'text' },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom fields</CardTitle>
        <CardDescription>
          Namespaced keys are stored per tenant. Field values live in the record's <code>custom_data</code> JSON.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActionError message={error} />
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={form.handleSubmit(async (values) => {
            setError(null)
            try {
              await createCustomField(tenantId, values)
              form.reset({ entity_type: values.entity_type, key: '', label: '', type: values.type })
              onChanged()
              toast({ title: 'Custom field created' })
            } catch (cause) {
              setError(getErrorMessage(cause))
            }
          })}
        >
          <div>
            <Label htmlFor="field-entity">Applies to</Label>
            <Select id="field-entity" {...form.register('entity_type')}>
              <option value="contact">Contact</option>
              <option value="lead">Lead</option>
              <option value="deal">Deal</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="field-key">Key</Label>
            <Input id="field-key" placeholder="preferred_time" {...form.register('key')} />
            <FieldError>{form.formState.errors.key?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="field-label">Label</Label>
            <Input id="field-label" placeholder="Preferred time" {...form.register('label')} />
            <FieldError>{form.formState.errors.label?.message}</FieldError>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="field-type">Type</Label>
              <Select id="field-type" {...form.register('type')}>
                {customFieldTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
            </div>
            <Button type="submit" loading={form.formState.isSubmitting}><Plus className="size-4" /> Add</Button>
          </div>
        </form>

        {fields.length ? (
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
            {fields.map((field) => (
              <li key={field.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <Badge variant="brand">{field.entity_type}</Badge>
                <span className="font-medium text-ink-900">{field.label}</span>
                <code className="text-xs text-ink-500">{field.key}</code>
                <span className="ml-auto text-xs text-ink-500">{field.type}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${field.label}`}
                  onClick={async () => {
                    setError(null)
                    try {
                      await deleteCustomField(tenantId, field.id)
                      onChanged()
                      toast({ title: 'Custom field deleted' })
                    } catch (cause) {
                      setError(getErrorMessage(cause))
                    }
                  }}
                >
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No custom fields" description="Add fields when your business needs to capture extra details." />
        )}
      </CardContent>
    </Card>
  )
}
