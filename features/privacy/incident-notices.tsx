'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2Icon,
  ClipboardCopyIcon,
  FileTextIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import {
  useDraftNotices,
  useIncident,
  useRecordNotification,
  useSignOffNotices,
  useUpdateNotices,
} from '@/lib/api/hooks/use-privacy'
import { isApiError } from '@/lib/api/client'
import type { IncidentSummary, NoticeDraft } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { toastError } from '@/lib/utils/toast-error'
import { useSession } from '@/components/providers/session-provider'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateText } from '@/components/date-text'
import { DateField } from '@/components/form/date-field'
import { FormField } from '@/components/form/form-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type Kind = 'npc' | 'subjects'

const KIND_LABEL: Record<Kind, string> = { npc: 'NPC notice', subjects: 'Data subject notice' }

function onWriteError(e: unknown, reload: () => void) {
  if (isApiError(e) && e.isConflict) {
    toast.error('Someone changed this incident. The latest version is loaded; try again.')
    reload()
    return
  }
  toastError(e)
}

function RecordNotificationDialog({
  incident,
  kind,
  onOpenChange,
}: {
  incident: IncidentSummary
  kind: Kind | null
  onOpenChange: (o: boolean) => void
}) {
  const { org } = useSession()
  const record = useRecordNotification(org.slug, incident.id)
  const reload = useIncident(org.slug, incident.id).refetch
  const [at, setAt] = useState(() => {
    const now = new Date()
    now.setSeconds(0, 0)
    return now.toISOString()
  })
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!kind) return null
  const npc = kind === 'npc'
  const save = () => {
    setError(null)
    record.mutate(
      { ifVersion: incident.version, kind, at, reference: npc ? reference || null : undefined },
      {
        onSuccess: () => {
          toast.success(
            npc
              ? 'NPC notification recorded. The clock has stopped.'
              : 'Data subject notification recorded.',
          )
          onOpenChange(false)
        },
        onError: (e) => {
          if (isApiError(e) && e.isConflict) return onWriteError(e, () => void reload())
          setError(isApiError(e) ? (e.fields?.at ?? e.message) : 'Couldn’t record it. Try again.')
        },
      },
    )
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {npc ? 'Record NPC notification' : 'Record data subject notification'}
          </DialogTitle>
          <DialogDescription>
            {npc
              ? 'Record when the signed-off notice was sent to the National Privacy Commission. This stops the 72-hour clock.'
              : 'Record when the affected people were notified.'}
          </DialogDescription>
        </DialogHeader>
        <FormField label="Sent at" required error={error ?? undefined}>
          <DateField
            mode="datetime"
            value={at}
            onChange={setAt}
            timezone={org.timezone}
            max={new Date().toISOString()}
          />
        </FormField>
        {npc ? (
          <FormField
            label="NPC reference"
            hint="Optional: the acknowledgement or case number the NPC gave."
          >
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              autoComplete="off"
            />
          </FormField>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={record.isPending || !at}>
            {npc ? 'Record NPC notification' : 'Record notification'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoticeEditor({
  kind,
  draft,
  onChange,
  readOnly,
}: {
  kind: Kind
  draft: NoticeDraft
  onChange: (d: NoticeDraft) => void
  readOnly: boolean
}) {
  const copy = () =>
    void navigator.clipboard
      .writeText(`${draft.subject}\n\n${draft.body}`)
      .then(() => toast.success(`${KIND_LABEL[kind]} copied`))
  return (
    <div className="flex flex-col gap-3">
      <FormField label="Subject">
        <Input
          value={draft.subject}
          onChange={(e) => onChange({ ...draft, subject: e.target.value })}
          readOnly={readOnly}
        />
      </FormField>
      <FormField
        label="Notice"
        hint={readOnly ? undefined : 'Fill in the bracketed parts before sign-off.'}
      >
        <Textarea
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
          readOnly={readOnly}
          rows={18}
          className="font-mono text-sm leading-relaxed"
          data-testid={`notice-${kind}`}
        />
      </FormField>
      <Button variant="ghost" size="sm" className="w-fit" onClick={copy}>
        <ClipboardCopyIcon aria-hidden="true" /> Copy {KIND_LABEL[kind].toLowerCase()}
      </Button>
    </div>
  )
}

function NoticesBody({ incident }: { incident: IncidentSummary }) {
  const { org } = useSession()
  const can = useCan()
  const reload = useIncident(org.slug, incident.id).refetch
  const update = useUpdateNotices(org.slug, incident.id)
  const signOff = useSignOffNotices(org.slug, incident.id)
  const redraft = useDraftNotices(org.slug, incident.id)
  const notices = incident.notices
  const [npc, setNpc] = useState<NoticeDraft>(notices?.npc ?? { subject: '', body: '' })
  const [subjects, setSubjects] = useState<NoticeDraft>(
    notices?.subjects ?? { subject: '', body: '' },
  )
  const [confirm, setConfirm] = useState<'sign' | 'redraft' | null>(null)
  const [recording, setRecording] = useState<Kind | null>(null)
  if (!notices) return null

  const signed = Boolean(notices.signedOffAt)
  const final = Boolean(incident.npcNotifiedAt) || incident.status === 'closed'
  const canEdit = can('privacy.edit') && !final
  const dirty =
    npc.subject !== notices.npc.subject ||
    npc.body !== notices.npc.body ||
    subjects.subject !== notices.subjects.subject ||
    subjects.body !== notices.subjects.body
  const canSign = can('incidents.sign_off') && !signed && !final

  const save = () =>
    update.mutate(
      { ifVersion: incident.version, npc, subjects },
      {
        onSuccess: () =>
          toast.success(signed ? 'Notices saved. They need signing off again.' : 'Notices saved'),
        onError: (e) => onWriteError(e, () => void reload()),
      },
    )

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="notices-status"
        className={
          signed
            ? 'flex flex-wrap items-center gap-2 rounded-md border border-ok/30 bg-ok-soft px-3 py-2'
            : 'flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2'
        }
      >
        {signed ? (
          <>
            <ShieldCheckIcon className="size-4 text-ok" aria-hidden="true" />
            <p className="flex-1 text-base">
              Signed off by <strong className="font-semibold">{notices.signedOffByName}</strong>{' '}
              <DateText value={notices.signedOffAt} relative />.
            </p>
          </>
        ) : (
          <>
            <FileTextIcon className="size-4 text-muted" aria-hidden="true" />
            <p className="flex-1 text-base">
              Drafted by {notices.draftedByName} <DateText value={notices.draftedAt} relative />.
              Not signed off yet.
            </p>
          </>
        )}
        {canSign ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setConfirm('sign')}
            disabled={dirty || incident.notificationRequired !== true}
          >
            <ShieldCheckIcon aria-hidden="true" /> Sign off notices
          </Button>
        ) : null}
      </div>
      {canSign && incident.notificationRequired !== true ? (
        <p className="text-sm text-muted">
          Sign-off needs triage to record that notification is required.
        </p>
      ) : null}
      {!signed && !can('incidents.sign_off') && !final ? (
        <p className="text-sm text-muted">
          An approver, owner or admin signs off the notices before they’re sent.
        </p>
      ) : null}

      <Tabs defaultValue="npc">
        <TabsList aria-label="Notices">
          <TabsTrigger value="npc">{KIND_LABEL.npc}</TabsTrigger>
          <TabsTrigger value="subjects">{KIND_LABEL.subjects}</TabsTrigger>
        </TabsList>
        <TabsContent value="npc">
          <NoticeEditor kind="npc" draft={npc} onChange={setNpc} readOnly={!canEdit} />
        </TabsContent>
        <TabsContent value="subjects">
          <NoticeEditor
            kind="subjects"
            draft={subjects}
            onChange={setSubjects}
            readOnly={!canEdit}
          />
        </TabsContent>
      </Tabs>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save notices'}
          </Button>
          {dirty && signed ? (
            <span className="text-sm text-warn">Saving clears the sign-off.</span>
          ) : null}
          <Button variant="ghost" className="ml-auto" onClick={() => setConfirm('redraft')}>
            <RefreshCwIcon aria-hidden="true" /> Redraft from linked records
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <h3 className="label-caps">Sent</h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          {(['npc', 'subjects'] as const).map((kind) => {
            const at = kind === 'npc' ? incident.npcNotifiedAt : incident.subjectsNotifiedAt
            return (
              <div key={kind} className="flex flex-col gap-1">
                <dt className="text-sm text-muted">
                  {kind === 'npc' ? 'Sent to NPC at' : 'Data subjects notified at'}
                </dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {at ? (
                    <span
                      className="inline-flex items-center gap-1.5"
                      data-testid={`notified-${kind}`}
                    >
                      <CheckCircle2Icon className="size-4 text-ok" aria-hidden="true" />
                      <DateText value={at} withTime />
                      {kind === 'npc' && incident.npcReference ? (
                        <span className="font-mono text-sm text-muted">
                          {incident.npcReference}
                        </span>
                      ) : null}
                    </span>
                  ) : can('privacy.edit') && signed && incident.status !== 'closed' ? (
                    <Button
                      variant={kind === 'npc' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setRecording(kind)}
                    >
                      <SendIcon aria-hidden="true" />
                      {kind === 'npc'
                        ? 'Record NPC notification'
                        : 'Record data subject notification'}
                    </Button>
                  ) : (
                    <span className="text-muted">{signed ? 'Not yet' : 'After sign-off'}</span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>

      <ConfirmDialog
        open={confirm === 'sign'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Sign off the notices for ${incident.ref}?`}
        description="You confirm both notices are approved to send. Any later edit clears your sign-off."
        confirmLabel="Sign off notices"
        pending={signOff.isPending}
        onConfirm={() =>
          signOff.mutate(incident.version, {
            onSuccess: () => {
              setConfirm(null)
              toast.success('Notices signed off')
            },
            onError: (e) => {
              setConfirm(null)
              onWriteError(e, () => void reload())
            },
          })
        }
      />
      <ConfirmDialog
        open={confirm === 'redraft'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Redraft the notices?"
        description="Both notices are rebuilt from the incident and its linked records. Your edits and any sign-off are replaced."
        confirmLabel="Redraft notices"
        pending={redraft.isPending}
        onConfirm={() =>
          redraft.mutate(incident.version, {
            onSuccess: () => {
              setConfirm(null)
              toast.success('Notices redrafted')
            },
            onError: (e) => {
              setConfirm(null)
              onWriteError(e, () => void reload())
            },
          })
        }
      />
      <RecordNotificationDialog
        key={recording ?? 'none'}
        incident={incident}
        kind={recording}
        onOpenChange={(o) => !o && setRecording(null)}
      />
    </div>
  )
}

/** Notices card: draft from linked records, edit, sign off (approver), record sending. */
export function IncidentNotices({ incident }: { incident: IncidentSummary }) {
  const { org } = useSession()
  const can = useCan()
  const draft = useDraftNotices(org.slug, incident.id)
  const reload = useIncident(org.slug, incident.id).refetch
  const blocked =
    incident.notificationRequired === false
      ? 'Triage recorded that notification isn’t required.'
      : incident.status === 'closed'
        ? 'This incident is closed.'
        : null

  return (
    <Card id="notices" data-testid="notices">
      <CardHeader className="flex-col gap-1">
        <CardTitle className="text-base">Notices</CardTitle>
        <CardDescription>
          The notice to the National Privacy Commission and the notice to affected data subjects,
          pre-filled from this incident and its linked records.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {incident.notices ? (
          // Remount on every saved version so the editors show what's stored.
          <NoticesBody key={incident.version} incident={incident} />
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-base text-muted">
              {blocked ??
                'No notices yet. Link the processing records and systems involved first: they fill in the data subjects, data categories and systems.'}
            </p>
            {can('privacy.edit') && !blocked ? (
              <Button
                variant="primary"
                disabled={draft.isPending}
                onClick={() =>
                  draft.mutate(incident.version, {
                    onSuccess: () => toast.success('Notices drafted from linked records'),
                    onError: (e) => onWriteError(e, () => void reload()),
                  })
                }
              >
                <FileTextIcon aria-hidden="true" />{' '}
                {draft.isPending ? 'Drafting…' : 'Draft notices'}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
