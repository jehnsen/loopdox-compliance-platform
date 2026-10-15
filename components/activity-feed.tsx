'use client'

import { useQuery } from '@tanstack/react-query'
import { HistoryIcon } from 'lucide-react'
import { api, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type { AuditEvent, ListResponse } from '@/lib/api/types'
import { initials } from '@/lib/utils/format'
import { useOrgSlug } from '@/components/providers/session-provider'
import { DateText } from '@/components/date-text'
import { EmptyState, ErrorState } from '@/components/states'
import { Skeleton } from '@/components/ui/skeleton'

/** Plain-language verbs for audit actions. Unknown actions fall back to their key. */
const ACTION_LABELS: Record<string, (d: Record<string, unknown>) => string> = {
  'document.created': (d) => `created ${d.version ? `v${String(d.version)}` : 'this page'}`,
  'document.edited': (d) =>
    `saved v${String(d.version)}${d.statusFrom === 'approved' ? ', returning it to Draft' : ''}`,
  'document.updated': () => 'updated the details',
  'document.submitted': (d) => `submitted v${String(d.version)} for review`,
  'document.approved': (d) => `approved v${String(d.version)}`,
  'document.changes_requested': (d) => `requested changes to v${String(d.version)}`,
  'document.restored': (d) => `restored v${String(d.restoredFrom)} as v${String(d.version)}`,
  'document.retired': () => 'retired this page',
  'document.acknowledged': (d) => `acknowledged v${String(d.version)}`,
  'document.ack_reminder_sent': (d) =>
    `sent acknowledgement reminders to ${String(d.count)} people`,
  'document.moved': () => 'moved this page',
  'document.deleted': () => 'deleted this page',
  // Privacy (M3)
  'processing_activity.created': () => 'created this record',
  'processing_activity.updated': (d) =>
    d.statusTo ? `changed the status to ${String(d.statusTo)}` : 'updated the details',
  'pia.created': () => 'started this assessment',
  'pia.updated': (d) => `saved progress (step ${String(d.step)})`,
  'pia.signed_off': (d) => `signed off: ${String(d.decision).replace(/_/g, ' ')}`,
  'dsr.created': () => 'logged this request',
  'dsr.updated': (d) =>
    d.assignee ? `assigned it to ${String(d.assignee)}` : 'updated the details',
  'dsr.identity_verified': () => 'verified the requester’s identity',
  'dsr.in_progress': () => 'started work on the request',
  'dsr.responded': (d) =>
    `responded${d.outcome ? ` (${String(d.outcome).replace(/_/g, ' ')})` : ''}`,
  'dsr.closed': () => 'closed the request',
  'dsr.file_attached': (d) => `attached ${String(d.name)}`,
  'dsr.file_removed': (d) => `removed ${String(d.name)}`,
  'sensitive.revealed': (d) =>
    `revealed the ${d.field === 'requesterName' ? 'requester’s name' : 'requester’s contact'}`,
  'incident.reported': () => 'reported this incident',
  'incident.triaged': (d) =>
    d.notificationRequired === true
      ? 'decided NPC notification is required'
      : d.notificationRequired === false
        ? 'decided notification isn’t required'
        : 'updated the triage',
  'incident.updated': () => 'updated the details',
  'incident.contained': () => 'marked it contained',
  'incident.closed': () => 'closed the incident',
  'incident.notices_drafted': () => 'drafted the notices',
  'incident.notices_edited': (d) =>
    d.signOffCleared ? 'edited the notices, clearing the sign-off' : 'edited the notices',
  'incident.notices_signed_off': () => 'signed off the notices',
  'incident.npc_notified': (d) =>
    `recorded the NPC notification${d.reference ? ` (${String(d.reference)})` : ''}${d.late ? ', after the deadline' : ''}`,
  'incident.subjects_notified': () => 'recorded that data subjects were notified',
  'agreement.created': () => 'added this agreement',
  'agreement.updated': () => 'updated the details',
  'agreement.renewed': (d) => `recorded a renewal to ${String(d.renewsAt)}`,
  'registration.created': () => 'added the registration',
  'registration.updated': (d) =>
    d.dpoName ? `changed the DPO on record to ${String(d.dpoName)}` : 'updated the registration',
  'registration.renewed': (d) => `recorded a renewal to ${String(d.renewsAt)}`,
}

function linkLabel(d: Record<string, unknown>): string {
  return [d.ref, d.title].filter((v) => typeof v === 'string' && v).join(' ')
}

export function describeAction(event: Pick<AuditEvent, 'action' | 'details'>): string {
  const fn = ACTION_LABELS[event.action]
  if (fn) return fn(event.details)
  if (event.action.endsWith('.linked')) return `linked ${linkLabel(event.details)}`
  if (event.action.endsWith('.unlinked')) return `unlinked ${linkLabel(event.details)}`
  return event.action.split('.').at(-1)?.replace(/_/g, ' ') ?? event.action
}

/** Audit events for one record, newest first. */
export function ActivityFeed({ targetType, targetId }: { targetType: string; targetId: string }) {
  const org = useOrgSlug()
  const query = { targetType, targetId, pageSize: 100 }
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: qk.auditEvents(org, query),
    queryFn: ({ signal }) =>
      api.get<ListResponse<AuditEvent>>(orgPath(org, '/audit-events'), { query, signal }),
  })
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    )
  }
  if (isError) return <ErrorState title="Couldn’t load activity" onRetry={() => void refetch()} />
  if (!data?.items.length) {
    return (
      <EmptyState
        icon={HistoryIcon}
        title="No activity yet"
        body="Changes to this record appear here, with who made them and when."
      />
    )
  }
  return (
    <ol className="flex flex-col" aria-label="Activity">
      {data.items.map((e) => {
        const note = typeof e.details.note === 'string' ? e.details.note : null
        return (
          <li key={e.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xs font-semibold text-muted"
            >
              {e.actor ? initials(e.actor.name) : 'LD'}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-base">
                <span className="font-medium">{e.actor?.name ?? 'System'}</span> {describeAction(e)}
              </p>
              {note ? <p className="rounded-md bg-surface-2 px-2 py-1 text-sm">“{note}”</p> : null}
              <DateText value={e.at} relative className="text-xs text-muted" />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
