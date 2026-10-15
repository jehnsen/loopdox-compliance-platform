'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckIcon, Trash2Icon } from 'lucide-react'
import {
  useAttachDsrFile,
  useDsr,
  useDsrTransition,
  useRemoveDsrFile,
  useUpdateDsr,
} from '@/lib/api/hooks/use-privacy'
import { isApiError } from '@/lib/api/client'
import type { DsrDetail, DsrOutcome, DsrStatus } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import {
  DSR_CHANNEL_LABELS,
  DSR_OUTCOME_LABELS,
  DSR_STATUS_LABELS,
  DSR_STATUS_ORDER,
  DSR_TYPE_LABELS,
} from '@/lib/privacy'
import { cn } from '@/lib/utils/cn'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ActivityFeed } from '@/components/activity-feed'
import { CalendarDate, DateText } from '@/components/date-text'
import { FileDropzone, FileLink } from '@/components/file-dropzone'
import { FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { LinkedRecords } from '@/components/linked-records'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { SensitiveValue } from '@/components/sensitive-value'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { privacyPaths } from '@/features/privacy/paths'
import { detailFallback, DuePill, Field, privacyCrumbs } from '@/features/privacy/shared'

const NEXT_ACTION: Partial<Record<DsrStatus, { to: DsrStatus; label: string; body: string }>> = {
  received: {
    to: 'identity_verified',
    label: 'Mark identity verified',
    body: 'Confirm you’ve checked the requester is who they say they are. Note how.',
  },
  identity_verified: {
    to: 'in_progress',
    label: 'Start work',
    body: 'Start gathering what the request needs.',
  },
  in_progress: {
    to: 'responded',
    label: 'Record response',
    body: 'Record the outcome you sent the requester.',
  },
  responded: {
    to: 'closed',
    label: 'Close request',
    body: 'Close the request. It becomes read-only.',
  },
}

/** 409 on an inline edit: reload and ask the user to redo it. */
function reportWriteError(e: unknown, reload: () => void) {
  if (isApiError(e) && e.isConflict) {
    toast.error(
      'Someone changed this request. The latest version is loaded; make your change again.',
    )
    reload()
    return
  }
  toastError(e)
}

function Timeline({ dsr }: { dsr: DsrDetail }) {
  const current = DSR_STATUS_ORDER.indexOf(dsr.status)
  return (
    <ol className="flex flex-col" aria-label="Request timeline">
      {DSR_STATUS_ORDER.map((status, i) => {
        const event = [...dsr.events].reverse().find((e) => e.status === status)
        const done = i <= current
        return (
          <li key={status} className="relative flex gap-3 pb-4 last:pb-0">
            {i < DSR_STATUS_ORDER.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-6 bottom-0 left-[11px] w-px',
                  i < current ? 'bg-ok' : 'bg-line',
                )}
              />
            ) : null}
            <span
              className={cn(
                'relative flex size-6 shrink-0 items-center justify-center rounded-full border',
                i < current || (done && status === 'closed')
                  ? 'border-ok bg-ok-soft text-ok'
                  : i === current
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-line bg-surface',
              )}
            >
              {i < current || (done && status === 'closed') ? (
                <CheckIcon className="size-3.5" aria-hidden="true" />
              ) : i === current ? (
                <span className="size-2 rounded-full bg-current" aria-hidden="true" />
              ) : null}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              <p className={cn('font-medium', !done && 'text-muted')}>
                {DSR_STATUS_LABELS[status]}
                {i === current && status !== 'closed' ? (
                  <span className="sr-only"> (current)</span>
                ) : null}
              </p>
              {event ? (
                <p className="text-sm text-muted">
                  <DateText value={event.at} withTime /> · {event.byName}
                </p>
              ) : null}
              {event?.note ? <p className="text-sm">“{event.note}”</p> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function TransitionDialog({
  dsr,
  open,
  onOpenChange,
}: {
  dsr: DsrDetail
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const org = useOrgSlug()
  const transition = useDsrTransition(org, dsr.id)
  const action = NEXT_ACTION[dsr.status]
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState<DsrOutcome | ''>('')
  const [error, setError] = useState<string | null>(null)
  if (!action) return null
  const needsOutcome = action.to === 'responded'
  const confirm = () => {
    if (needsOutcome && !outcome) {
      setError('Choose the outcome of the request.')
      return
    }
    transition.mutate(
      {
        ifVersion: dsr.version,
        status: action.to,
        note: note || undefined,
        outcome: outcome || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${dsr.ref}: ${DSR_STATUS_LABELS[action.to]}`)
          setNote('')
          setOutcome('')
          onOpenChange(false)
        },
        onError: (e) => setError(isApiError(e) ? e.message : 'Couldn’t update the request.'),
      },
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription>{action.body}</DialogDescription>
        </DialogHeader>
        {needsOutcome ? (
          <FormField
            id="dsr-outcome"
            label="Outcome"
            required
            error={error && !outcome ? error : undefined}
          >
            <Select value={outcome} onValueChange={(v) => setOutcome(v as DsrOutcome)}>
              <SelectTrigger id="dsr-outcome">
                <SelectValue placeholder="Choose the outcome" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DSR_OUTCOME_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        ) : null}
        <FormField label="Note" hint="Optional. Shown on the timeline.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </FormField>
        {error && (!needsOutcome || outcome) ? (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={transition.isPending}>
            {action.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResponseNotes({ dsr, editable }: { dsr: DsrDetail; editable: boolean }) {
  const org = useOrgSlug()
  const update = useUpdateDsr(org, dsr.id)
  const query = useDsr(org, dsr.id)
  const [notes, setNotes] = useState(dsr.responseNotes)
  const dirty = notes !== dsr.responseNotes
  if (!editable) {
    return dsr.responseNotes ? (
      <p className="whitespace-pre-line">{dsr.responseNotes}</p>
    ) : (
      <p className="text-muted">No notes yet.</p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <FormField
        label="Response notes"
        hint="What was done, what was sent, and anything withheld and why."
      >
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
      </FormField>
      <Button
        variant="secondary"
        size="sm"
        className="w-fit"
        disabled={!dirty || update.isPending}
        onClick={() =>
          update.mutate(
            { ifVersion: dsr.version, responseNotes: notes },
            {
              onSuccess: () => toast.success('Notes saved'),
              onError: (e) => reportWriteError(e, () => void query.refetch()),
            },
          )
        }
      >
        {update.isPending ? 'Saving…' : 'Save notes'}
      </Button>
    </div>
  )
}

export function DsrPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const query = useDsr(org, id)
  const update = useUpdateDsr(org, id)
  const attach = useAttachDsrFile(org, id)
  const removeFile = useRemoveDsrFile(org, id)
  const [transitionOpen, setTransitionOpen] = useState(false)

  const fallback = detailFallback(query, privacyPaths.requests(org))
  if (fallback || !query.data) return fallback
  const dsr = query.data
  const editable = can('privacy.edit') && dsr.status !== 'closed'
  const action = NEXT_ACTION[dsr.status]
  const reload = () => void query.refetch()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${DSR_TYPE_LABELS[dsr.type]} request`}
        id={dsr.ref}
        status={
          <>
            <StatusPill status={dsr.status} />
            <DuePill state={dsr.dueState} days={dsr.daysLeft} />
          </>
        }
        breadcrumbs={privacyCrumbs(
          { label: 'Data subject requests', href: privacyPaths.requests(org) },
          { label: dsr.ref },
        )}
        className="pb-0"
        actions={
          editable && action ? (
            <Button variant="primary" onClick={() => setTransitionOpen(true)}>
              {action.label}
            </Button>
          ) : null
        }
      />
      <MetadataStrip
        items={[
          { label: 'Status', value: <StatusPill status={dsr.status} /> },
          { label: 'Received', value: <CalendarDate value={dsr.receivedAt} /> },
          { label: 'Due', value: <CalendarDate value={dsr.dueAt} /> },
          { label: 'Received by', value: DSR_CHANNEL_LABELS[dsr.channel] },
          {
            label: 'Assignee',
            value: dsr.assigneeName ?? <span className="text-muted">Unassigned</span>,
          },
          { label: 'Outcome', value: dsr.outcome ? DSR_OUTCOME_LABELS[dsr.outcome] : null },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Requester</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <SensitiveValue
                    masked={dsr.requesterName}
                    label="requester name"
                    target={{ targetType: 'dsr', targetId: dsr.id, field: 'requesterName' }}
                  />
                </Field>
                <Field label="Contact">
                  <SensitiveValue
                    masked={dsr.requesterContact}
                    label="requester contact"
                    target={{ targetType: 'dsr', targetId: dsr.id, field: 'requesterContact' }}
                  />
                </Field>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request and response</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <dl>
                <Field label="What they asked for">
                  {dsr.description ? (
                    <p className="max-w-reading whitespace-pre-line">{dsr.description}</p>
                  ) : (
                    <span className="text-muted">Not described</span>
                  )}
                </Field>
              </dl>
              <ResponseNotes key={dsr.version} dsr={dsr} editable={editable} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Files</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {dsr.files.length ? (
                <ul className="flex flex-col">
                  {dsr.files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 border-b border-line py-1.5 last:border-b-0"
                    >
                      <FileLink file={f} className="flex-1" />
                      <DateText value={f.uploadedAt} relative className="text-xs text-muted" />
                      {editable ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${f.name}`}
                          onClick={() =>
                            removeFile.mutate(f.id, {
                              onSuccess: () => toast.success(`Removed ${f.name}`),
                              onError: (e) => toastError(e),
                            })
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No files attached.</p>
              )}
              {editable ? (
                <FileDropzone
                  label="Attach a file to this request"
                  onUploaded={(file) =>
                    attach.mutate(file.id, {
                      onSuccess: () => toast.success(`Attached ${file.name}`),
                      onError: (e) => toastError(e),
                    })
                  }
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Timeline dsr={dsr} />
              {editable ? (
                <FormField label="Assignee">
                  <PeoplePicker
                    value={dsr.assignee}
                    placeholder="Unassigned"
                    onChange={(assignee) =>
                      update.mutate(
                        { ifVersion: dsr.version, assignee },
                        {
                          onSuccess: (d) =>
                            toast.success(`Assigned to ${d.assigneeName ?? 'nobody'}`),
                          onError: (e) => reportWriteError(e, reload),
                        },
                      )
                    }
                  />
                </FormField>
              ) : null}
            </CardContent>
          </Card>
          <LinkedRecords type="dsr" id={dsr.id} readOnly={!editable} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed targetType="dsr" targetId={dsr.id} />
            </CardContent>
          </Card>
        </div>
      </div>
      <TransitionDialog dsr={dsr} open={transitionOpen} onOpenChange={setTransitionOpen} />
    </div>
  )
}
