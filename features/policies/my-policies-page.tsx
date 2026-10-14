'use client'

import Link from 'next/link'
import { BookOpenCheckIcon, CheckCircle2Icon } from 'lucide-react'
import { useDocuments } from '@/lib/api/hooks/use-documents'
import type { DocumentSummary } from '@/lib/api/types'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip, VersionChip } from '@/components/chips'
import { CalendarDate } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { policyPaths } from '@/features/policies/paths'

function PolicyRow({ doc, pending }: { doc: DocumentSummary; pending: boolean }) {
  const org = useOrgSlug()
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <IdChip>{doc.docId}</IdChip>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={policyPaths.view(org, doc.id)}
          className="font-medium hover:text-accent hover:underline"
        >
          {doc.title}
        </Link>
        <span className="text-sm text-muted">
          <VersionChip version={doc.approvedVersion ?? doc.currentVersion} className="mr-1.5" />
          Effective <CalendarDate value={doc.effectiveDate} />
        </span>
      </div>
      {pending ? (
        <Button asChild variant="primary" size="sm">
          <Link href={policyPaths.view(org, doc.id)}>Read and acknowledge</Link>
        </Button>
      ) : (
        <span className="flex items-center gap-1.5 text-sm text-ok">
          <CheckCircle2Icon className="size-4" aria-hidden="true" /> Acknowledged
        </span>
      )}
    </li>
  )
}

/** Staff view: approved policies to read and acknowledge for their current version. */
export function MyPoliciesPage() {
  const org = useOrgSlug()
  const pending = useDocuments(org, { ack: ['pending'], pageSize: 200, sort: 'docId' })
  const done = useDocuments(org, { ack: ['done'], pageSize: 200, sort: 'docId' })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My policies"
        description="Approved policies you need to read. When a policy changes, you’re asked to acknowledge the new version."
      />
      <section aria-labelledby="to-read" className="flex flex-col gap-3">
        <h2 id="to-read" className="text-md font-semibold">
          To read
          {pending.data ? (
            <span className="ml-2 text-muted tabular-nums">{pending.data.total}</span>
          ) : null}
        </h2>
        {pending.isLoading ? (
          <Skeleton className="h-32" />
        ) : pending.isError ? (
          <ErrorState onRetry={() => void pending.refetch()} />
        ) : pending.data?.items.length ? (
          <ul
            className="divide-y divide-line rounded-lg border border-line bg-surface"
            data-testid="policies-to-read"
          >
            {pending.data.items.map((d) => (
              <PolicyRow key={d.id} doc={d} pending />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={BookOpenCheckIcon}
            title="You’re up to date"
            body="You’ve acknowledged every policy that applies to you."
          />
        )}
      </section>
      <section aria-labelledby="done" className="flex flex-col gap-3">
        <h2 id="done" className="text-md font-semibold">
          Acknowledged
        </h2>
        {done.data?.items.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {done.data.items.map((d) => (
              <PolicyRow key={d.id} doc={d} pending={false} />
            ))}
          </ul>
        ) : done.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <p className="text-base text-muted">Nothing acknowledged yet.</p>
        )}
      </section>
    </div>
  )
}
