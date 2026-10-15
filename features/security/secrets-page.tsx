'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  InfoIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react'
import {
  useDeleteSecret,
  useMarkRotated,
  useSaveSecret,
  useSecrets,
  useSystems,
} from '@/lib/api/hooks/use-security'
import { isApiError } from '@/lib/api/client'
import type { SecretRecordSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { secretFormSchema, type SecretFormValues } from '@/lib/schemas/security'
import { todayInTz } from '@/lib/utils/dates'
import { toastError } from '@/lib/utils/toast-error'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug, useSession } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { CalendarDate } from '@/components/date-text'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
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
import { Textarea } from '@/components/ui/textarea'
import { securityPaths } from '@/features/security/paths'
import { DuePill, securityCrumbs } from '@/features/security/shared'

const FILTER_KEYS = ['due'] as const
const NONE = '__none__'

function SecretDialog({
  record,
  onClose,
}: {
  record: SecretRecordSummary | null
  onClose: () => void
}) {
  const { org, user } = useSession()
  const save = useSaveSecret(org.slug)
  const systems = useSystems(org.slug, { pageSize: 200, sort: 'name' })
  const [error, setError] = useState<string | null>(null)
  const form = useForm<SecretFormValues>({
    resolver: zodResolver(secretFormSchema),
    defaultValues: record
      ? {
          name: record.name,
          location: record.location,
          systemId: record.systemId,
          owner: record.owner,
          lastRotatedAt: record.lastRotatedAt,
          rotationDays: record.rotationDays,
          notes: record.notes,
        }
      : {
          name: '',
          location: '',
          systemId: null,
          owner: user.id,
          lastRotatedAt: todayInTz(org.timezone),
          rotationDays: 90,
          notes: '',
        },
  })
  const { control, register, handleSubmit, formState, setError: setFieldError } = form
  const errors = formState.errors
  const submit = handleSubmit((v) =>
    save.mutate(
      { ...v, ...(record ? { id: record.id, ifVersion: record.version } : {}) },
      {
        onSuccess: () => {
          toast.success(record ? 'Secret record saved' : 'Secret record added')
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
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{record ? `Edit ${record.ref}` : 'Add a secret record'}</DialogTitle>
            <DialogDescription>
              Record what the secret is and where it is kept. Never paste the secret itself.
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <FormField label="Name" error={errors.name?.message} required>
            <Input
              {...register('name')}
              placeholder="e.g. PostgreSQL admin password"
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="Where it is stored"
            hint="The vault or store, not the value."
            error={errors.location?.message}
            required
          >
            <Input
              {...register('location')}
              placeholder="e.g. Azure Key Vault: kv-prod"
              autoComplete="off"
            />
          </FormField>
          <Controller
            control={control}
            name="systemId"
            render={({ field }) => (
              <FormField id="secret-system" label="System">
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                >
                  <SelectTrigger id="secret-system">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not tied to one system</SelectItem>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="lastRotatedAt"
              render={({ field }) => (
                <FormField label="Last rotated" error={errors.lastRotatedAt?.message} required>
                  <DateField mode="date" value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
            <FormField label="Rotate every (days)" error={errors.rotationDays?.message} required>
              <Input
                type="number"
                min={1}
                max={730}
                {...register('rotationDays', { valueAsNumber: true })}
              />
            </FormField>
          </div>
          <Controller
            control={control}
            name="owner"
            render={({ field }) => (
              <FormField label="Owner" error={errors.owner?.message} required>
                <PeoplePicker value={field.value} onChange={field.onChange} />
              </FormField>
            )}
          />
          <FormField label="Notes" error={errors.notes?.message}>
            <Textarea {...register('notes')} rows={2} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : record ? 'Save changes' : 'Add secret record'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Rotation tracker: where each secret lives and when it is next due. Never the value. */
export function SecretsPage() {
  const org = useOrgSlug()
  const can = useCan()
  const edit = can('security.edit')
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useSecrets(org, query)
  const rotate = useMarkRotated(org)
  const del = useDeleteSecret(org)
  const [dialog, setDialog] = useState<{ record: SecretRecordSummary | null } | null>(null)
  const [rotating, setRotating] = useState<SecretRecordSummary | null>(null)
  const [deleting, setDeleting] = useState<SecretRecordSummary | null>(null)

  const columns = useMemo<ColumnDef<SecretRecordSummary>[]>(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-24' },
        cell: ({ row }) => <IdChip>{row.original.ref}</IdChip>,
      },
      {
        id: 'name',
        header: 'Secret',
        meta: { label: 'Secret', sortKey: 'name', alwaysVisible: true, className: 'min-w-52' },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'location',
        header: 'Stored in',
        meta: { label: 'Stored in', sortKey: 'location', className: 'min-w-44' },
        cell: ({ row }) => row.original.location,
      },
      {
        id: 'system',
        header: 'System',
        meta: { label: 'System' },
        cell: ({ row }) =>
          row.original.systemId ? (
            <Link
              href={securityPaths.systemView(org, row.original.systemId)}
              className="hover:text-accent hover:underline"
            >
              {row.original.systemName}
            </Link>
          ) : (
            <span className="text-muted">None</span>
          ),
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner', sortKey: 'ownerName' },
        cell: ({ row }) => row.original.ownerName,
      },
      {
        id: 'lastRotatedAt',
        header: 'Last rotated',
        meta: { label: 'Last rotated', sortKey: 'lastRotatedAt' },
        cell: ({ row }) => (
          <CalendarDate value={row.original.lastRotatedAt} className="whitespace-nowrap" />
        ),
      },
      {
        id: 'cadence',
        header: 'Every',
        meta: { label: 'Every', sortKey: 'rotationDays', align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.rotationDays} d</span>,
      },
      {
        id: 'nextDueAt',
        header: 'Next due',
        meta: { label: 'Next due', sortKey: 'nextDueAt' },
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
            <CalendarDate value={row.original.nextDueAt} />
            <DuePill state={row.original.dueState} days={row.original.daysLeft} />
          </span>
        ),
      },
      ...(edit
        ? [
            {
              id: 'actions',
              header: () => <span className="sr-only">Actions</span>,
              meta: { label: 'Actions', alwaysVisible: true, align: 'right' as const },
              cell: ({ row }) => (
                <span className="flex justify-end gap-1 whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRotating(row.original)}
                    aria-label={`Mark ${row.original.name} rotated`}
                  >
                    <RefreshCwIcon aria-hidden="true" /> Mark rotated
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDialog({ record: row.original })}
                    aria-label={`Edit ${row.original.name}`}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleting(row.original)}
                    aria-label={`Delete ${row.original.name}`}
                  >
                    <Trash2Icon />
                  </Button>
                </span>
              ),
            } satisfies ColumnDef<SecretRecordSummary>,
          ]
        : []),
    ],
    [org, edit],
  )

  const addButton = edit ? (
    <Button variant="primary" onClick={() => setDialog({ record: null })}>
      <PlusIcon aria-hidden="true" /> Add secret record
    </Button>
  ) : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Secrets"
        breadcrumbs={securityCrumbs({ label: 'Secrets' })}
        description="Rotation tracker. Overdue secrets come first."
        actions={addButton}
        className="pb-0"
      />
      <div
        role="note"
        className="flex items-start gap-2 rounded-md border border-line bg-surface px-4 py-3 text-base"
      >
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        <p>
          <strong className="font-semibold">
            LoopDox stores where a secret lives, never its value.
          </strong>{' '}
          Keep the secret in your vault. Here you track which one it is, who owns it and when it
          must be rotated.
        </p>
      </div>
      <DataTable
        label="Secret records"
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
        getRowId={(s) => s.id}
        searchPlaceholder="Search by ID, name or location"
        rowClassName={(s) =>
          s.dueState === 'overdue'
            ? 'bg-bad-soft/50'
            : s.dueState === 'due_soon'
              ? 'bg-warn-soft/50'
              : undefined
        }
        filters={
          <FacetFilter
            label="Rotation"
            options={[
              { value: 'overdue', label: 'Overdue' },
              { value: 'due_soon', label: 'Due within 14 days' },
              { value: 'ok', label: 'On schedule' },
            ]}
            selected={params.filters.due ?? []}
            onChange={(v) => setParams({ filters: { due: v } })}
          />
        }
        emptyState={
          <EmptyState
            icon={KeyRoundIcon}
            title="No secret records yet"
            body="List each key, token and password the organisation depends on: where it is stored and how often it must be rotated."
            actions={addButton}
          />
        }
      />

      {dialog ? <SecretDialog record={dialog.record} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog
        open={rotating !== null}
        onOpenChange={(o) => !o && setRotating(null)}
        title={rotating ? `Mark ${rotating.name} rotated?` : ''}
        description={
          rotating
            ? `This records that the secret was rotated today, and the next rotation falls due in ${rotating.rotationDays} days. Rotate it in ${rotating.location} first.`
            : ''
        }
        confirmLabel="Mark rotated"
        pending={rotate.isPending}
        onConfirm={() => {
          if (!rotating) return
          rotate.mutate(
            { id: rotating.id, ifVersion: rotating.version },
            {
              onSuccess: () => {
                toast.success(`${rotating.name} marked rotated`)
                setRotating(null)
              },
              onError: (e) => {
                setRotating(null)
                toastError(e)
              },
            },
          )
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Delete ${deleting.ref}?` : ''}
        description="The record is removed from the tracker. The secret itself isn’t touched."
        confirmLabel="Delete record"
        destructive
        typedConfirmation={deleting?.ref}
        pending={del.isPending}
        onConfirm={() => {
          if (!deleting) return
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(`Deleted ${deleting.ref}`)
              setDeleting(null)
            },
            onError: (e) => {
              setDeleting(null)
              toastError(e)
            },
          })
        }}
      />
    </div>
  )
}
