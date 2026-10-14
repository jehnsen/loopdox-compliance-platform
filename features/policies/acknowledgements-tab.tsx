'use client'

import { toast } from 'sonner'
import { BellRingIcon, UsersIcon } from 'lucide-react'
import { useAcknowledgements, useRemindAcknowledgements } from '@/lib/api/hooks/use-documents'
import type { DocumentDetail } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { ROLE_LABELS } from '@/lib/auth/permissions'
import { plural } from '@/lib/utils/format'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { DateText } from '@/components/date-text'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

export function AcknowledgementsTab({ doc }: { doc: DocumentDetail }) {
  const org = useOrgSlug()
  const can = useCan()
  const acks = useAcknowledgements(org, doc.id)
  const remind = useRemindAcknowledgements(org, doc.id)

  if (acks.isLoading) return <Skeleton className="h-64" />
  if (acks.isError)
    return <ErrorState title="Couldn’t load acknowledgements" onRetry={() => void acks.refetch()} />
  const data = acks.data
  if (!data || data.version === null || !doc.requiresApproval) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="Nothing to acknowledge yet"
        body={
          doc.requiresApproval
            ? 'Once a version is approved, staff are asked to read and acknowledge it, and their progress shows here.'
            : 'This page doesn’t need approval, so staff aren’t asked to acknowledge it.'
        }
      />
    )
  }
  const pct = data.required ? Math.round((data.acknowledged / data.required) * 100) : 0
  const pending = data.required - data.acknowledged
  const canRemind = (can('policies.edit') || can('policies.approve')) && pending > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <div className="flex min-w-60 flex-1 flex-col gap-2">
          <p className="text-base">
            <span className="font-semibold tabular-nums">
              {data.acknowledged} of {data.required}
            </span>{' '}
            people have acknowledged v{data.version}
          </p>
          <Progress
            value={pct}
            aria-label={`${pct}% acknowledged`}
            indicatorClassName={pct === 100 ? 'bg-ok' : undefined}
          />
        </div>
        {canRemind ? (
          <Button
            variant="secondary"
            disabled={remind.isPending}
            onClick={() =>
              remind.mutate(undefined, {
                onSuccess: (r) =>
                  toast.success(
                    r.reminded
                      ? `Reminded ${plural(r.reminded, 'person', 'people')}`
                      : 'Everyone else has acknowledged it.',
                  ),
                onError: (e) => toastError(e),
              })
            }
          >
            <BellRingIcon aria-hidden="true" /> Remind {plural(pending, 'person', 'people')}
          </Button>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table
          className="w-full min-w-[520px] text-base tabular-nums"
          aria-label={`Acknowledgements of v${data.version}`}
        >
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th scope="col" className="h-9 px-3 font-semibold">
                Person
              </th>
              <th scope="col" className="px-3 font-semibold">
                Role
              </th>
              <th scope="col" className="px-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-3 font-semibold">
                Acknowledged
              </th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.userId} className="h-10 border-t border-line">
                <td className="px-3">
                  <span className="font-medium">{m.name}</span>
                  {m.title ? <span className="block text-xs text-muted">{m.title}</span> : null}
                </td>
                <td className="px-3 text-sm text-muted">
                  {m.roles.map((r) => ROLE_LABELS[r]).join(', ')}
                </td>
                <td className="px-3">
                  <StatusPill status={m.acknowledgedAt ? 'acknowledged' : 'pending'} />
                </td>
                <td className="px-3 text-muted">
                  {m.acknowledgedAt ? <DateText value={m.acknowledgedAt} relative /> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
