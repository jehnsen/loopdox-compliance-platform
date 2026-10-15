'use client'

import Link from 'next/link'
import { useControl, useControlEvidence } from '@/lib/api/hooks/use-security'
import { useDocumentLookup } from '@/lib/api/hooks/use-documents'
import { useMembers } from '@/lib/api/hooks/use-members'
import { isApiError } from '@/lib/api/client'
import { PERMISSION_LABELS } from '@/lib/auth/permissions'
import { FRAMEWORK_LABELS } from '@/lib/overview'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { EvidenceTimeline } from '@/components/evidence-timeline'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { ErrorState, ForbiddenState, NotFoundState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { policyPaths } from '@/features/policies/paths'

const FREQUENCY: Record<string, string> = {
  continuous: 'Continuous',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
}

/**
 * A control with its linked policies and evidence timeline. M5 builds this page so a
 * signed-off access review can be seen on the control; M6 adds uploads, connectors
 * and the controls list around it.
 */
export function ControlPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const control = useControl(org, id)
  const evidence = useControlEvidence(org, id)
  const docs = useDocumentLookup(org)
  const members = useMembers(org)

  if (control.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (control.isError || !control.data) {
    const e = control.error
    if (isApiError(e) && e.isNotFound) return <NotFoundState homeHref={`/${org}`} />
    if (isApiError(e) && e.isForbidden) {
      return (
        <ForbiddenState permissionLabel={PERMISSION_LABELS['evidence.read']} homeHref={`/${org}`} />
      )
    }
    return <ErrorState onRetry={() => void control.refetch()} />
  }
  const c = control.data
  const linked = (docs.data ?? []).filter((d) => c.documentIds.includes(d.id))
  const owner = members.data?.find((m) => m.userId === c.owner)?.name ?? null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={c.title}
        id={c.reference}
        status={<StatusPill status={c.status} />}
        description={FRAMEWORK_LABELS[c.framework]}
        breadcrumbs={[
          { label: 'Evidence' },
          { label: 'Controls', href: `/${org}/evidence/controls` },
          { label: c.reference },
        ]}
        className="pb-0"
      />
      <MetadataStrip
        items={[
          { label: 'Framework', value: FRAMEWORK_LABELS[c.framework] },
          { label: 'Reference', value: c.reference },
          { label: 'Owner', value: owner },
          { label: 'Evidence', value: FREQUENCY[c.evidenceFrequency] ?? c.evidenceFrequency },
          { label: 'Status', value: c.status.replace(/_/g, ' ') },
          { label: 'Policies', value: String(c.documentIds.length) },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evidence timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {evidence.isLoading ? (
              <Skeleton className="h-32" />
            ) : evidence.isError ? (
              <ErrorState title="Couldn’t load evidence" onRetry={() => void evidence.refetch()} />
            ) : (
              <EvidenceTimeline items={evidence.data?.items ?? []} />
            )}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What it requires</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{c.description}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Policies</CardTitle>
            </CardHeader>
            <CardContent>
              {linked.length ? (
                <ul className="flex flex-col gap-2">
                  {linked.map((d) => (
                    <li key={d.id} className="flex items-center gap-2">
                      <IdChip>{d.docId}</IdChip>
                      <Link
                        href={policyPaths.view(org, d.id)}
                        className="min-w-0 truncate hover:text-accent hover:underline"
                      >
                        {d.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No policies are linked to this control.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
