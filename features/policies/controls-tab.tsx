'use client'

import Link from 'next/link'
import { ListChecksIcon } from 'lucide-react'
import { useLinkedControls } from '@/lib/api/hooks/use-documents'
import type { DocumentDetail, Framework } from '@/lib/api/types'
import { useOrgSlug } from '@/components/providers/session-provider'
import { Gate } from '@/components/gate'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Skeleton } from '@/components/ui/skeleton'

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  'ISO27001:2022': 'ISO/IEC 27001:2022',
  DPA: 'Data Privacy Act',
  NPC: 'NPC',
  internal: 'Internal',
}

function ControlsList({ doc }: { doc: DocumentDetail }) {
  const org = useOrgSlug()
  const controls = useLinkedControls(org, doc.id, true)
  if (controls.isLoading) return <Skeleton className="h-48" />
  if (controls.isError)
    return (
      <ErrorState title="Couldn’t load linked controls" onRetry={() => void controls.refetch()} />
    )
  const items = controls.data?.items ?? []
  if (!items.length) {
    return (
      <EmptyState
        icon={ListChecksIcon}
        title="No controls linked"
        body="Controls from ISO/IEC 27001, the Data Privacy Act or NPC issuances that this policy implements appear here, with their evidence status."
      />
    )
  }
  return (
    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <span className="w-36 shrink-0 text-sm text-muted">{FRAMEWORK_LABELS[c.framework]}</span>
          <span className="w-28 shrink-0 font-mono text-sm">{c.reference}</span>
          <Link
            href={`/${org}/evidence/controls/${c.id}`}
            className="min-w-0 flex-1 font-medium hover:text-accent hover:underline"
          >
            {c.title}
          </Link>
          <StatusPill status={c.status} />
        </li>
      ))}
    </ul>
  )
}

export function ControlsTab({ doc }: { doc: DocumentDetail }) {
  return (
    <Gate feature="evidence">
      <ControlsList doc={doc} />
    </Gate>
  )
}
