import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Archive, Handshake, Pencil, Plus, UserCheck, X } from 'lucide-react'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ActivityIcon, ContactStatusBadge, LeadStatusBadge } from './StatusBadges'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { activityLabel } from '../utils'
import { activitySchema, type ActivityFormValues } from '../schemas'
import {
  addActivity,
  archiveContact,
  assignContact,
  attachTag,
  claimLead,
  detachTag,
  fetchContactDetail,
  type CrmOptions,
} from '../api'
import { formatDateTime } from '@/lib/format'
import type { ContactRow } from '@/types/database'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: string
  contactId: string | null
  options: CrmOptions
  currentUserId: string
  canManagePipeline: boolean
  onEdit: (contact: ContactRow) => void
  onConvert: (contactId: string) => void
  onChanged: () => void
}

export function ContactDetailModal({
  open,
  onClose,
  tenantId,
  contactId,
  options,
  currentUserId,
  canManagePipeline,
  onEdit,
  onConvert,
  onChanged,
}: Props) {
  const { toast } = useToast()
  const [assignTarget, setAssignTarget] = useState('')
  const [tagTarget, setTagTarget] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['crm', tenantId, 'contact', contactId],
    enabled: open && Boolean(tenantId && contactId),
    queryFn: () => fetchContactDetail(tenantId, contactId as string),
  })

  const activityForm = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema),
    defaultValues: { type: 'note', subject: '', body: '' },
  })

  useEffect(() => {
    if (!open) return
    setAssignTarget('')
    setTagTarget('')
    setActionError(null)
    activityForm.reset({ type: 'note', subject: '', body: '' })
  }, [open, contactId, activityForm])

  const detail = detailQuery.data
  const contact = detail?.contact
  const mapsUrl = contact?.google_maps_url?.trim()
  const safeMapsUrl = mapsUrl && /^https?:\/\//i.test(mapsUrl) ? mapsUrl : null
  const isUnassignedLead = Boolean(contact && contact.status === 'lead' && !contact.assigned_to)
  const assignedToMe = Boolean(contact?.assigned_to === currentUserId)

  const refresh = () => {
    void detailQuery.refetch()
    onChanged()
  }

  const runAction = async (label: string, action: () => Promise<void>) => {
    setActionError(null)
    try {
      await action()
      toast({ title: label })
      refresh()
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  const onAddActivity = activityForm.handleSubmit(async (values) => {
    if (!contactId) return
    await runAction('Activity logged', async () => {
      await addActivity(tenantId, contactId, values)
      activityForm.reset({ type: values.type, subject: '', body: '' })
    })
  })

  const availableTags = options.tags.filter((tag) => !detail?.tagIds.includes(tag.id))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={contact ? `${contact.first_name} ${contact.last_name ?? ''}`.trim() : 'Contact'}
      description={contact?.company ?? 'Contact details and activity history'}
      className="max-w-3xl"
    >
      {detailQuery.isLoading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-12" />)}</div>
      ) : detailQuery.isError ? (
        <ErrorState message={getErrorMessage(detailQuery.error)} onRetry={() => void detailQuery.refetch()} />
      ) : !contact || !detail ? (
        <EmptyState title="Contact unavailable" description="It may have been removed or is no longer visible to you." />
      ) : (
        <div className="space-y-5">
          {actionError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <ContactStatusBadge status={contact.status} />
            <LeadStatusBadge status={contact.lead_status} />
            {contact.assigned_to ? (
              <Badge variant="neutral">
                Assigned to {options.members.find((member) => member.user_id === contact.assigned_to)?.full_name ?? 'a teammate'}
              </Badge>
            ) : (
              <Badge variant="warning">Unassigned</Badge>
            )}
          </div>

          <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-ink-100 bg-ink-50/60 p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-ink-500">Email</dt><dd className="truncate text-ink-900">{contact.email ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-500">Phone</dt><dd className="text-ink-900">{contact.phone ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-500">Source</dt><dd className="text-ink-900">{options.sources.find((source) => source.id === contact.source_id)?.name ?? contact.source ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-500">Next follow-up</dt><dd className="text-ink-900">{formatDateTime(contact.follow_up_at)}</dd></div>
            <div><dt className="text-xs text-ink-500">Clinic</dt><dd className="text-ink-900">{contact.clinic ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-500">Area</dt><dd className="text-ink-900">{contact.area ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-500">Mobile (+91)</dt><dd className="text-ink-900">{contact.mobile ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-500">Rating</dt><dd className="text-ink-900">{contact.rating == null ? '—' : `${contact.rating.toFixed(1)} / 5`}</dd></div>
            <div><dt className="text-xs text-ink-500">Reviews</dt><dd className="text-ink-900">{contact.reviews ?? '—'}</dd></div>
            <div><dt className="text-xs text-ink-500">Sent?</dt><dd className="text-ink-900">{contact.sent ? 'Yes' : 'No'}</dd></div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-500">Why included</dt>
              <dd className="whitespace-pre-wrap text-ink-700">{contact.why_included ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-500">Google Maps link</dt>
              <dd className="break-all text-ink-700">
                {safeMapsUrl ? (
                  <a href={safeMapsUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                    View on Google Maps
                  </a>
                ) : (
                  mapsUrl ?? '—'
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-500">Reply 1</dt>
              <dd className="whitespace-pre-wrap text-ink-700">{contact.reply_1 ?? '—'}</dd>
            </div>
            {contact.notes ? (
              <div className="sm:col-span-2"><dt className="text-xs text-ink-500">Notes</dt><dd className="whitespace-pre-wrap text-ink-700">{contact.notes}</dd></div>
            ) : null}
          </dl>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink-900">Tags</h4>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {detail.tagIds.map((tagId) => {
                const tag = options.tags.find((item) => item.id === tagId)
                if (!tag) return null
                return (
                  <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                    {tag.name}
                    {canManagePipeline ? (
                      <button
                        type="button"
                        aria-label={`Remove ${tag.name} tag`}
                        onClick={() => void runAction('Tag removed', () => detachTag(tenantId, contact.id, tag.id))}
                        className="rounded-full p-0.5 hover:bg-brand-100"
                      >
                        <X className="size-3" />
                      </button>
                    ) : null}
                  </span>
                )
              })}
              {canManagePipeline && availableTags.length > 0 ? (
                <div className="flex items-center gap-1">
                  <Select
                    aria-label="Select a tag"
                    value={tagTarget}
                    onChange={(event) => setTagTarget(event.target.value)}
                    className="h-8 w-36 px-2 text-xs"
                  >
                    <option value="">Choose tag…</option>
                    {availableTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!tagTarget}
                    onClick={() => {
                      const id = tagTarget
                      setTagTarget('')
                      void runAction('Tag added', () => attachTag(tenantId, contact.id, id))
                    }}
                  >
                    <Plus className="size-3.5" /> Add
                  </Button>
                </div>
              ) : null}
              {detail.tagIds.length === 0 && (!canManagePipeline || availableTags.length === 0) ? (
                <span className="text-xs text-ink-500">No tags</span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => onEdit(contact)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
            {isUnassignedLead ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void runAction('Lead claimed', () => claimLead(tenantId, contact.id))}>
                <UserCheck className="size-3.5" /> Claim lead
              </Button>
            ) : null}
            {contact.status === 'lead' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onConvert(contact.id)}>
                <Handshake className="size-3.5" /> Convert to deal
              </Button>
            ) : null}
            {canManagePipeline ? (
              <>
                <div className="flex items-center gap-1">
                  <Select
                    aria-label="Assign contact to"
                    value={assignTarget}
                    onChange={(event) => setAssignTarget(event.target.value)}
                    className="h-8 w-40 px-2 text-xs"
                  >
                    <option value="">Assign to…</option>
                    {options.members.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.full_name ?? member.user_id}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!assignTarget || assignTarget === contact.assigned_to}
                    onClick={() => {
                      const id = assignTarget
                      setAssignTarget('')
                      void runAction('Contact assigned', () => assignContact(tenantId, contact.id, id))
                    }}
                  >
                    Assign
                  </Button>
                </div>
                {contact.status !== 'inactive' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void runAction('Contact archived', () => archiveContact(tenantId, contact.id))}
                  >
                    <Archive className="size-3.5" /> Archive
                  </Button>
                ) : null}
              </>
            ) : null}
            {!canManagePipeline && !isUnassignedLead && !assignedToMe ? (
              <p className="self-center text-xs text-ink-500">You can edit contacts assigned to you.</p>
            ) : null}
          </div>

          <form onSubmit={onAddActivity} className="space-y-3 rounded-lg border border-ink-200 p-4" noValidate>
            <h4 className="text-sm font-semibold text-ink-900">Log an interaction</h4>
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              <div>
                <Label htmlFor="activity-type">Type</Label>
                <Select id="activity-type" {...activityForm.register('type')}>
                  <option value="note">Note</option>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="task">Task</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="activity-subject">Subject</Label>
                <Input id="activity-subject" placeholder="e.g. Introductory call" {...activityForm.register('subject')} />
              </div>
            </div>
            <div>
              <Label htmlFor="activity-body">Details</Label>
              <Textarea id="activity-body" placeholder="What happened?" {...activityForm.register('body')} />
              <FieldError>{activityForm.formState.errors.body?.message}</FieldError>
            </div>
            <Button type="submit" size="sm" loading={activityForm.formState.isSubmitting}>
              <Plus className="size-3.5" /> Add activity
            </Button>
          </form>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-ink-900">Activity timeline</h4>
            {detail.activities.length ? (
              <ol className="space-y-4 border-l border-ink-200 pl-4">
                {detail.activities.map((activity) => (
                  <li key={activity.id} className="relative">
                    <span className="absolute -left-[25px] flex size-4 items-center justify-center rounded-full bg-white text-ink-500">
                      <ActivityIcon type={activity.type} />
                    </span>
                    <p className="text-sm font-medium text-ink-900">
                      {activity.subject ?? activityLabel(activity.type)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {activityLabel(activity.type)} · {formatDateTime(activity.occurred_at)}
                    </p>
                    {activity.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{activity.body}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="No activity yet" description="Log a call, email or note to build this history." />
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
