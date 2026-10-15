'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  ExternalLinkIcon,
  GitPullRequestIcon,
  PencilIcon,
  PlusIcon,
  RocketIcon,
  SirenIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react'
import {
  useChanges,
  useReviewChange,
  useSaveChange,
  useSystems,
} from '@/lib/api/hooks/use-security'
import { isApiError } from '@/lib/api/client'
import type { ChangeReviewState, ChangeSource, ChangeSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { changeFormSchema, type ChangeFormValues } from '@/lib/schemas/security'
import { CHANGE_SOURCE_LABELS } from '@/lib/security'
import { toastError } from '@/lib/utils/toast-error'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug, useSession } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { DateText } from '@/components/date-text'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { securityPaths } from '@/features/security/paths'
import { securityCrumbs } from '@/features/security/shared'

const FILTER_KEYS = ['source', 'emergency', 'review'] as const

const SOURCE_ICONS: Record<ChangeSource, LucideIcon> = {
  github_pr: GitPullRequestIcon,
  deploy: RocketIcon,
  manual: WrenchIcon,
}

const REVIEW_PILLS: Record<
  Exclude<ChangeReviewState, 'not_required'>,
  { status: string; label: string }
> = {
  pending: { status: 'due_soon', label: 'Review due' },
  overdue: { status: 'overdue', label: 'Review overdue' },
  done: { status: 'acknowledged', label: 'Reviewed' },
}

function ChangeDialog({ change, onClose }: { change: ChangeSummary | null; onClose: () => void }) {
  const { org } = useSession()
  const save = useSaveChange(org.slug)
  const systems = useSystems(org.slug, { pageSize: 200, sort: 'name' })
  const [error, setError] = useState<string | null>(null)
  const form = useForm<ChangeFormValues>({
    resolver: zodResolver(changeFormSchema),
    defaultValues: change
      ? {
          source: change.source,
          externalUrl: change.externalUrl,
          systemId: change.systemId,
          summary: change.summary,
          approver: change.approver,
          deployedAt: change.deployedAt,
          rollbackPlan: change.rollbackPlan,
          emergency: change.emergency,
        }
      : {
          source: 'github_pr',
          externalUrl: null,
          systemId: '',
          summary: '',
          approver: null,
          deployedAt: new Date().toISOString(),
          rollbackPlan: '',
          emergency: false,
        },
  })
  const { control, register, handleSubmit, formState, setError: setFieldError } = form
  const errors = formState.errors
  const emergency = useWatch({ control, name: 'emergency' })
  const submit = handleSubmit((v) =>
    save.mutate(
      { ...v, ...(change ? { id: change.id, ifVersion: change.version } : {}) },
      {
        onSuccess: () => {
          toast.success(change ? 'Change saved' : 'Change logged')
          onClose()
        },
        onError: (e) => {
          if (isApiError(e) && e.isConflict) {
            setError('Someone changed this record. Close this window and open it again.')
            return
          }
          if (isApiError(e) && applyFieldErrors(e.fields, setFieldError)) return
          setError(isApiError(e) ? e.message : 'Couldn’t save. Try again.')
        },
      },
    ),
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{change ? `Edit ${change.ref}` : 'Log a change'}</DialogTitle>
            <DialogDescription>
              What changed, on which system, who approved it, and how to undo it.
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <FormField id="chg-source" label="Source" required>
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v as ChangeSource)}
                  >
                    <SelectTrigger id="chg-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CHANGE_SOURCE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="systemId"
              render={({ field }) => (
                <FormField id="chg-system" label="System" error={errors.systemId?.message} required>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="chg-system">
                      <SelectValue placeholder="Choose a system" />
                    </SelectTrigger>
                    <SelectContent>
                      {(systems.data?.items ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
          </div>
          <FormField label="What changed" error={errors.summary?.message} required>
            <Input {...register('summary')} autoComplete="off" />
          </FormField>
          <FormField
            label="Link"
            hint="The pull request or deployment run, if there is one."
            error={errors.externalUrl?.message}
          >
            <Input
              {...register('externalUrl', { setValueAs: (v: string | null) => v?.trim() || null })}
              placeholder="https://github.com/…"
              autoComplete="off"
            />
          </FormField>
          <Controller
            control={control}
            name="deployedAt"
            render={({ field }) => (
              <FormField label="Deployed at" error={errors.deployedAt?.message} required>
                <DateField
                  mode="datetime"
                  value={field.value}
                  onChange={field.onChange}
                  timezone={org.timezone}
                  max={new Date().toISOString()}
                />
              </FormField>
            )}
          />
          <FormField label="Rollback plan" error={errors.rollbackPlan?.message} required>
            <Textarea {...register('rollbackPlan')} rows={2} />
          </FormField>
          <Controller
            control={control}
            name="emergency"
            render={({ field }) => (
              <label className="flex items-start gap-3 text-base">
                <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                <span>
                  Emergency change
                  <span className="block text-sm text-muted">
                    Skipped the normal approval. It needs a review note within 2 days.
                  </span>
                </span>
              </label>
            )}
          />
          <Controller
            control={control}
            name="approver"
            render={({ field }) => (
              <FormField
                label="Approved by"
                hint={
                  emergency
                    ? 'Optional for an emergency change; add it when it’s approved.'
                    : undefined
                }
                error={errors.approver?.message}
                required={!emergency}
              >
                <PeoplePicker
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={emergency ? 'Not approved yet' : 'Choose a person'}
                />
              </FormField>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : change ? 'Save changes' : 'Log change'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReviewDialog({ change, onClose }: { change: ChangeSummary; onClose: () => void }) {
  const org = useOrgSlug()
  const review = useReviewChange(org)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            review.mutate(
              { id: change.id, ifVersion: change.version, note },
              {
                onSuccess: () => {
                  toast.success(`Review recorded for ${change.ref}`)
                  onClose()
                },
                onError: (err) => {
                  if (isApiError(err) && err.fields?.note) setError(err.fields.note)
                  else toastError(err)
                },
              },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Review {change.ref}</DialogTitle>
            <DialogDescription>
              {change.summary}. Say what you checked after the fact and what you found.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Review note" error={error ?? undefined} required>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={review.isPending}>
              {review.isPending ? 'Saving…' : 'Record review'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The change log. Emergency changes owe a review note within 2 days. */
export function ChangesPage() {
  const org = useOrgSlug()
  const can = useCan()
  const edit = can('security.edit')
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useChanges(org, query)
  const [dialog, setDialog] = useState<{ change: ChangeSummary | null } | null>(null)
  const [reviewing, setReviewing] = useState<ChangeSummary | null>(null)

  const columns = useMemo<ColumnDef<ChangeSummary>[]>(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-24' },
        cell: ({ row }) => <IdChip>{row.original.ref}</IdChip>,
      },
      {
        id: 'source',
        header: 'Source',
        meta: { label: 'Source', sortKey: 'source' },
        cell: ({ row }) => {
          const c = row.original
          const Icon = SOURCE_ICONS[c.source]
          const label = CHANGE_SOURCE_LABELS[c.source]
          return c.externalUrl ? (
            <a
              href={c.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-accent hover:underline"
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
              <ExternalLinkIcon className="size-3" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </span>
          )
        },
      },
      {
        id: 'summary',
        header: 'Change',
        meta: { label: 'Change', sortKey: 'summary', alwaysVisible: true, className: 'min-w-64' },
        cell: ({ row }) => (
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{row.original.summary}</span>
            <span className="text-sm text-muted">Rollback: {row.original.rollbackPlan}</span>
          </span>
        ),
      },
      {
        id: 'system',
        header: 'System',
        meta: { label: 'System', sortKey: 'systemName' },
        cell: ({ row }) => (
          <Link
            href={securityPaths.systemView(org, row.original.systemId)}
            className="hover:text-accent hover:underline"
          >
            {row.original.systemName}
          </Link>
        ),
      },
      {
        id: 'approver',
        header: 'Approved by',
        meta: { label: 'Approved by', sortKey: 'approverName' },
        cell: ({ row }) =>
          row.original.approverName ?? <span className="text-warn">Not approved yet</span>,
      },
      {
        id: 'deployedAt',
        header: 'Deployed',
        meta: { label: 'Deployed', sortKey: 'deployedAt' },
        cell: ({ row }) => (
          <DateText value={row.original.deployedAt} relative className="whitespace-nowrap" />
        ),
      },
      {
        id: 'emergency',
        header: 'Emergency',
        meta: { label: 'Emergency', sortKey: 'emergency' },
        cell: ({ row }) => {
          const c = row.original
          if (!c.emergency) return <span className="text-muted">No</span>
          const pill = c.reviewState !== 'not_required' ? REVIEW_PILLS[c.reviewState] : null
          return (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-sm bg-bad-soft px-1.5 py-0.5 text-xs font-semibold text-bad">
                <SirenIcon className="size-3" aria-hidden="true" /> Emergency
              </span>
              {pill ? <StatusPill status={pill.status} label={pill.label} /> : null}
            </span>
          )
        },
      },
      ...(edit
        ? [
            {
              id: 'actions',
              header: () => <span className="sr-only">Actions</span>,
              meta: { label: 'Actions', alwaysVisible: true, align: 'right' as const },
              cell: ({ row }) => (
                <span className="flex justify-end gap-1 whitespace-nowrap">
                  {row.original.emergency && !row.original.reviewNote ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setReviewing(row.original)}
                      aria-label={`Add review note to ${row.original.ref}`}
                    >
                      Add review
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDialog({ change: row.original })}
                    aria-label={`Edit ${row.original.ref}`}
                  >
                    <PencilIcon />
                  </Button>
                </span>
              ),
            } satisfies ColumnDef<ChangeSummary>,
          ]
        : []),
    ],
    [org, edit],
  )

  const addButton = edit ? (
    <Button variant="primary" onClick={() => setDialog({ change: null })}>
      <PlusIcon aria-hidden="true" /> Log a change
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Changes"
        breadcrumbs={securityCrumbs({ label: 'Changes' })}
        description="A log of changes to production systems: what changed, who approved it, and how to undo it. Emergency changes owe a review note within 2 days."
        actions={addButton}
      />
      <DataTable
        label="Changes"
        columns={columns}
        data={list.data}
        isLoading={list.isLoading}
        isFetching={list.isFetching}
        isError={list.isError}
        error={list.error}
        onRetry={() => void list.refetch()}
        params={params}
        setParams={setParams}
        query={query}
        getRowId={(c) => c.id}
        searchPlaceholder="Search by ID, summary or system"
        rowClassName={(c) => (c.reviewState === 'overdue' ? 'bg-bad-soft/50' : undefined)}
        filters={
          <>
            <FacetFilter
              label="Source"
              options={Object.entries(CHANGE_SOURCE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={params.filters.source ?? []}
              onChange={(v) => setParams({ filters: { source: v } })}
            />
            <FacetFilter
              label="Emergency"
              options={[
                { value: 'true', label: 'Emergency only' },
                { value: 'false', label: 'Normal changes' },
              ]}
              selected={params.filters.emergency ?? []}
              onChange={(v) => setParams({ filters: { emergency: v } })}
            />
            <FacetFilter
              label="Review"
              options={[
                { value: 'overdue', label: 'Review overdue' },
                { value: 'pending', label: 'Review due' },
                { value: 'done', label: 'Reviewed' },
              ]}
              selected={params.filters.review ?? []}
              onChange={(v) => setParams({ filters: { review: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={GitPullRequestIcon}
            title="No changes logged yet"
            body="Log each change to a production system, with its approver and a rollback plan."
            actions={addButton}
          />
        }
      />
      {dialog ? <ChangeDialog change={dialog.change} onClose={() => setDialog(null)} /> : null}
      {reviewing ? <ReviewDialog change={reviewing} onClose={() => setReviewing(null)} /> : null}
    </div>
  )
}
