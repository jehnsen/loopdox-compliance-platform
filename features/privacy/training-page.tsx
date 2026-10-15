'use client'

import { useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { GraduationCapIcon, PlusIcon } from 'lucide-react'
import { useMembers } from '@/lib/api/hooks/use-members'
import { useDeleteTraining, useSaveTraining, useTrainingRecords } from '@/lib/api/hooks/use-privacy'
import { isApiError } from '@/lib/api/client'
import type { TrainingRecordSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { trainingRecordSchema, type TrainingRecordValues } from '@/lib/schemas/privacy'
import { cn } from '@/lib/utils/cn'
import { addMonthsToDate, todayInTz } from '@/lib/utils/dates'
import { plural } from '@/lib/utils/format'
import { useSession } from '@/components/providers/session-provider'
import { CalendarDate } from '@/components/date-text'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { privacyCrumbs } from '@/features/privacy/shared'

function TrainingDialog({
  record,
  preset,
  courses,
  onClose,
}: {
  record: TrainingRecordSummary | null
  preset: { userId: string; course: string } | null
  courses: string[]
  onClose: () => void
}) {
  const { org } = useSession()
  const save = useSaveTraining(org.slug)
  const del = useDeleteTraining(org.slug)
  const listId = useId()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<TrainingRecordValues>({
    resolver: zodResolver(trainingRecordSchema),
    defaultValues: record
      ? {
          userId: record.userId,
          course: record.course,
          completedAt: record.completedAt,
          expiresAt: record.expiresAt,
        }
      : {
          userId: preset?.userId ?? '',
          course: preset?.course ?? '',
          completedAt: todayInTz(org.timezone),
          expiresAt: null,
        },
  })
  const { control, register, handleSubmit, formState, getValues, setError: setFieldError } = form
  const errors = formState.errors
  const submit = handleSubmit((v) =>
    save.mutate(
      { ...v, ...(record ? { id: record.id, ifVersion: record.version } : {}) },
      {
        onSuccess: () => {
          toast.success('Training record saved')
          onClose()
        },
        onError: (e) => {
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
            <DialogTitle>{record ? 'Edit training record' : 'Add training record'}</DialogTitle>
            <DialogDescription>
              Who completed which course, and when it needs renewing.
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <Controller
            control={control}
            name="userId"
            render={({ field }) => (
              <FormField label="Person" error={errors.userId?.message} required>
                <PeoplePicker value={field.value || null} onChange={field.onChange} />
              </FormField>
            )}
          />
          <FormField label="Course" error={errors.course?.message} required>
            <Input {...register('course')} list={listId} autoComplete="off" />
          </FormField>
          <datalist id={listId}>
            {courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="completedAt"
              render={({ field }) => (
                <FormField label="Completed on" error={errors.completedAt?.message} required>
                  <DateField mode="date" value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="expiresAt"
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  <FormField label="Expires on" error={errors.expiresAt?.message}>
                    <DateField
                      mode="date"
                      value={field.value}
                      onChange={(v) => field.onChange(v || null)}
                    />
                  </FormField>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value === null}
                      onCheckedChange={(v) =>
                        field.onChange(
                          v === true ? null : addMonthsToDate(getValues('completedAt'), 12),
                        )
                      }
                    />
                    Doesn’t expire
                  </label>
                </div>
              )}
            />
          </div>
          <DialogFooter>
            {record ? (
              <Button
                variant="danger-outline"
                className="sm:mr-auto"
                disabled={del.isPending}
                onClick={() =>
                  del.mutate(record.id, {
                    onSuccess: () => {
                      toast.success('Training record deleted')
                      onClose()
                    },
                    onError: (e) =>
                      setError(isApiError(e) ? e.message : 'Couldn’t delete. Try again.'),
                  })
                }
              >
                Delete
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Training: a matrix of people × courses with completion and expiry. */
export function TrainingPage() {
  const { org } = useSession()
  const can = useCan()
  const records = useTrainingRecords(org.slug)
  const members = useMembers(org.slug)
  const [dialog, setDialog] = useState<{
    record: TrainingRecordSummary | null
    preset: { userId: string; course: string } | null
  } | null>(null)
  const edit = can('privacy.edit')

  const items = records.data?.items ?? []
  const courses = [...new Set(items.map((r) => r.course))].sort((a, b) => a.localeCompare(b))
  const people = (members.data ?? []).filter((m) => !m.roles.every((r) => r === 'auditor'))
  const cell = (userId: string, course: string) =>
    items
      .filter((r) => r.userId === userId && r.course === course)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]
  const expired = items.filter((r) => r.state === 'expired').length
  const expiring = items.filter((r) => r.state === 'expiring').length
  const missing = people.reduce((n, p) => n + courses.filter((c) => !cell(p.userId, c)).length, 0)

  const addButton = edit ? (
    <Button variant="primary" onClick={() => setDialog({ record: null, preset: null })}>
      <PlusIcon aria-hidden="true" /> Add training record
    </Button>
  ) : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Training"
        breadcrumbs={privacyCrumbs({ label: 'Training' })}
        description="Who has completed privacy and security training, and when it needs renewing."
        actions={addButton}
        className="pb-0"
      />
      {records.isLoading || members.isLoading ? (
        <Skeleton className="h-64" />
      ) : records.isError ? (
        <ErrorState onRetry={() => void records.refetch()} />
      ) : !items.length ? (
        <EmptyState
          icon={GraduationCapIcon}
          title="No training recorded yet"
          body="Record who completed which course. Courses with expiry dates are flagged 30 days before they lapse."
          actions={addButton}
        />
      ) : (
        <>
          <p className="text-base" aria-live="polite">
            {plural(expired, 'expired record')} ·{' '}
            {plural(expiring, 'expiring within 30 days', 'expiring within 30 days')} ·{' '}
            {plural(missing, 'course not completed', 'courses not completed')}
          </p>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table
              className="w-full min-w-[640px] border-collapse text-base"
              aria-label="Training by person and course"
            >
              <thead className="bg-surface-2 text-left">
                <tr>
                  <th
                    scope="col"
                    className="h-9 border-b border-line px-3 text-xs font-semibold text-muted"
                  >
                    Person
                  </th>
                  {courses.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="h-9 border-b border-line px-3 text-xs font-semibold text-muted"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.userId} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      {p.name}
                      <span className="block text-xs font-normal text-muted">{p.title}</span>
                    </th>
                    {courses.map((c) => {
                      const r = cell(p.userId, c)
                      const body = r ? (
                        <span className="flex flex-col items-start gap-1">
                          <StatusPill status={r.state} />
                          <span className="text-xs text-muted">
                            Done <CalendarDate value={r.completedAt} />
                            {r.expiresAt ? (
                              <>
                                {' '}
                                · {r.state === 'expired' ? 'expired' : 'expires'}{' '}
                                <CalendarDate value={r.expiresAt} />
                              </>
                            ) : null}
                          </span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted">Not completed</span>
                      )
                      return (
                        <td
                          key={c}
                          className={cn(
                            'px-3 py-2 align-top',
                            r?.state === 'expired' && 'bg-bad-soft/40',
                            r?.state === 'expiring' && 'bg-warn-soft/40',
                          )}
                        >
                          {edit ? (
                            <button
                              type="button"
                              className="w-full rounded-sm text-left hover:bg-surface-2"
                              onClick={() =>
                                setDialog(
                                  r
                                    ? { record: r, preset: null }
                                    : { record: null, preset: { userId: p.userId, course: c } },
                                )
                              }
                            >
                              <span className="sr-only">
                                {r ? 'Edit' : 'Add'} {c} for {p.name}:{' '}
                              </span>
                              {body}
                            </button>
                          ) : (
                            body
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {dialog ? (
        <TrainingDialog
          key={dialog.record?.id ?? `${dialog.preset?.userId}-${dialog.preset?.course}`}
          record={dialog.record}
          preset={dialog.preset}
          courses={courses}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}
