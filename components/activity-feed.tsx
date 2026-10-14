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
  'document.ack_reminder_sent': (d) => `sent acknowledgement reminders to ${String(d.count)} people`,
  'document.moved': () => 'moved this page',
  'document.deleted': () => 'deleted this page',
}

export function describeAction(event: AuditEvent): string {
  const fn = ACTION_LABELS[event.action]
  return fn ? fn(event.details) : event.action.split('.').at(-1)?.replace(/_/g, ' ') ?? event.action
}

/** Audit events for one record, newest first. */
export function ActivityFeed({ targetType, targetId }: { targetType: string; targetId: string }) {
  const org = useOrgSlug()
  const query = { targetType, targetId, pageSize: 100 }
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: qk.auditEvents(org, query),
    queryFn: ({ signal }) => api.get<ListResponse<AuditEvent>>(orgPath(org, '/audit-events'), { query, signal }),
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
    return <EmptyState icon={HistoryIcon} title="No activity yet" body="Edits, approvals and acknowledgements appear here." />
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
