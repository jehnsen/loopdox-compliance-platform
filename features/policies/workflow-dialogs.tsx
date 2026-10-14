'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useDeleteDocument, useDocumentWorkflow } from '@/lib/api/hooks/use-documents'
import type { DocumentDetail } from '@/lib/api/types'
import { addMonthsToDate, formatCalendarDate, todayInTz } from '@/lib/utils/dates'
import { toastError } from '@/lib/utils/toast-error'
import { useSession } from '@/components/providers/session-provider'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { policyPaths } from '@/features/policies/paths'

export type WorkflowDialog = 'submit' | 'approve' | 'reject' | 'retire' | 'delete' | null

function NoteField({
  label,
  value,
  onChange,
  required,
  error,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  error?: string | null
  hint?: string
}) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-bad"> *</span>
        ) : (
          <span className="font-normal text-muted"> (optional)</span>
        )}
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** All workflow dialogs for one document; `open` picks which one is showing. */
export function WorkflowDialogs({
  doc,
  open,
  onOpenChange,
}: {
  doc: DocumentDetail
  open: WorkflowDialog
  onOpenChange: (d: WorkflowDialog) => void
}) {
  const { org } = useSession()
  const router = useRouter()
  const workflow = useDocumentWorkflow(org.slug, doc.id)
  const remove = useDeleteDocument(org.slug, doc.id)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const v = doc.currentVersion
  const effective = todayInTz(org.timezone)
  const nextReview = addMonthsToDate(effective, doc.reviewCycleMonths)

  const close = () => {
    setNote('')
    setNoteError(null)
    onOpenChange(null)
  }

  const act = (action: 'submit' | 'approve' | 'reject' | 'retire', success: string) => {
    if (action === 'reject' && note.trim().length < 3) {
      setNoteError('Explain what needs to change, so the author can fix it.')
      return
    }
    workflow.mutate(
      { action, note: note.trim(), ifVersion: doc.version },
      {
        onSuccess: () => {
          toast.success(success)
          close()
        },
        onError: (e) => toastError(e),
      },
    )
  }

  const dialog = (title: string, description: ReactNode, body: ReactNode, confirm: ReactNode) => (
    <Dialog open onOpenChange={(o) => (o ? null : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          {confirm}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  switch (open) {
    case 'submit':
      return dialog(
        `Submit v${v} for review`,
        'Approvers are notified and can approve it or request changes. You can keep editing; saving again withdraws it from review.',
        <NoteField
          label="Note for the approver"
          value={note}
          onChange={setNote}
          hint="For example, what changed and why."
        />,
        <Button
          variant="primary"
          disabled={workflow.isPending}
          onClick={() => act('submit', `Submitted v${v} for review`)}
        >
          Submit v{v} for review
        </Button>,
      )
    case 'approve':
      return dialog(
        `Approve v${v}`,
        <>
          v{v} becomes the approved version on record and takes effect today. Staff are asked to
          acknowledge it.
        </>,
        <>
          <dl className="grid grid-cols-2 gap-3 rounded-md border border-line bg-surface-2/50 px-3 py-2">
            <div>
              <dt className="label-caps">Effective</dt>
              <dd>{formatCalendarDate(effective)}</dd>
            </div>
            <div>
              <dt className="label-caps">Next review</dt>
              <dd>
                {formatCalendarDate(nextReview)}{' '}
                <span className="text-sm text-muted">(every {doc.reviewCycleMonths} months)</span>
              </dd>
            </div>
          </dl>
          <NoteField label="Approval note" value={note} onChange={setNote} />
        </>,
        <Button
          variant="primary"
          disabled={workflow.isPending}
          onClick={() => act('approve', `Approved v${v}`)}
        >
          Approve v{v}
        </Button>,
      )
    case 'reject':
      return dialog(
        `Request changes to v${v}`,
        'The document goes back to Draft and the owner is notified with your note.',
        <NoteField
          label="What needs to change?"
          value={note}
          onChange={(t) => {
            setNote(t)
            if (noteError && t.trim().length >= 3) setNoteError(null)
          }}
          required
          error={noteError}
        />,
        <Button
          variant="primary"
          disabled={workflow.isPending}
          onClick={() => act('reject', 'Sent back with your note')}
        >
          Request changes
        </Button>,
      )
    case 'retire':
      return dialog(
        `Retire ${doc.docId}`,
        'Retired documents stay readable for reference but are no longer in force, need no review, and can’t be edited.',
        <NoteField label="Reason" value={note} onChange={setNote} />,
        <Button
          variant="danger"
          disabled={workflow.isPending}
          onClick={() => act('retire', `Retired ${doc.docId}`)}
        >
          Retire {doc.docId}
        </Button>,
      )
    case 'delete':
      return (
        <ConfirmDialog
          open
          onOpenChange={(o) => (o ? null : close())}
          title={`Delete ${doc.docId}`}
          description="This draft was never approved, so it can be deleted. Its versions are deleted too. This can’t be undone."
          confirmLabel={`Delete ${doc.docId}`}
          destructive
          typedConfirmation={doc.docId}
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                toast.success(`Deleted ${doc.docId}`)
                router.push(policyPaths.library(org.slug))
              },
              onError: (e) => toastError(e),
            })
          }
        />
      )
    default:
      return null
  }
}
