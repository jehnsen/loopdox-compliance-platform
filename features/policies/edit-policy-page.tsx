'use client'

import Link from 'next/link'
import { ArchiveIcon } from 'lucide-react'
import { useDocument } from '@/lib/api/hooks/use-documents'
import { isApiError } from '@/lib/api/client'
import { useCan } from '@/lib/auth/can'
import { PERMISSION_LABELS } from '@/lib/auth/permissions'
import { useOrgSlug } from '@/components/providers/session-provider'
import { EmptyState, ErrorState, ForbiddenState, NotFoundState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { policyPaths } from '@/features/policies/paths'
import { PolicyEditor } from '@/features/policies/policy-editor'

export function EditPolicyPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  // Always start from the latest saved version so `ifVersion` is current.
  const query = useDocument(org, id, { fresh: true })

  if (!can('policies.edit')) {
    return (
      <ForbiddenState
        permissionLabel={PERMISSION_LABELS['policies.edit']}
        homeHref={policyPaths.library(org)}
      />
    )
  }
  if (query.isLoading || (query.isFetching && !query.isFetchedAfterMount)) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only">Loading…</span>
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Skeleton className="h-[32rem]" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }
  if (query.isError || !query.data) {
    if (isApiError(query.error) && query.error.isNotFound)
      return <NotFoundState homeHref={policyPaths.library(org)} />
    return <ErrorState onRetry={() => void query.refetch()} />
  }
  const doc = query.data
  if (doc.status === 'retired') {
    return (
      <EmptyState
        icon={ArchiveIcon}
        title={`${doc.docId} is retired`}
        body="Retired documents are kept for reference and can’t be edited. Create a new page if this content is needed again."
        actions={
          <Button asChild variant="secondary">
            <Link href={policyPaths.view(org, doc.id)}>Back to {doc.docId}</Link>
          </Button>
        }
      />
    )
  }
  return <PolicyEditor key={doc.id} doc={doc} />
}
