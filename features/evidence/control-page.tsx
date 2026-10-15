'use client'

import Link from 'next/link'
import { useState } from 'react'
import { UploadIcon } from 'lucide-react'
import { isApiError } from '@/lib/api/client'
import { useControl, useControlEvidence } from '@/lib/api/hooks/use-evidence'
import { useDocumentLookup } from '@/lib/api/hooks/use-documents'
import { useCan } from '@/lib/auth/can'
import { PERMISSION_LABELS } from '@/lib/auth/permissions'
import { FREQUENCY_LABELS } from '@/lib/evidence'
import { FRAMEWORK_LABELS } from '@/lib/overview'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DateText } from '@/components/date-text'
import { EvidenceTimeline } from '@/components/evidence-timeline'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { ErrorState, ForbiddenState, NotFoundState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { evidencePaths } from '@/features/evidence/shared'
import { RunControlConnectors } from '@/features/evidence/run-connector'
import { UploadEvidenceDialog } from '@/features/evidence/upload-evidence-dialog'
import { policyPaths } from '@/features/policies/paths'

/**
 * A control with its linked policies and evidence timeline. People who can edit
 * evidence upload files and run connectors here; everyone else reads.
 */
export function ControlPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const control = useControl(org, id)
  const evidence = useControlEvidence(org, id)
  const docs = useDocumentLookup(org)
  const [uploading, setUploading] = useState(false)

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
  const canEdit = can('evidence.edit')

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={c.title}
        id={c.reference}
        status={<StatusPill status={c.status} />}
        description={FRAMEWORK_LABELS[c.framework]}
        breadcrumbs={[
          { label: 'Evidence' },
          { label: 'Controls', href: evidencePaths.controls(org) },
          { label: c.reference },
        ]}
        actions={
          canEdit ? (
            <>
              <RunControlConnectors connectors={c.connectors} />
              <Button variant="primary" onClick={() => setUploading(true)}>
                <UploadIcon aria-hidden="true" /> Upload evidence
              </Button>
            </>
          ) : null
        }
        className="pb-0"
      />
      {uploading ? (
        <UploadEvidenceDialog
          controlId={c.id}
          controlLabel={`${c.reference} ${c.title}`}
          onClose={() => setUploading(false)}
        />
      ) : null}
      <MetadataStrip
        items={[
          { label: 'Framework', value: FRAMEWORK_LABELS[c.framework] },
          { label: 'Reference', value: c.reference },
          { label: 'Owner', value: c.ownerName },
          {
            label: 'Evidence due',
            value: FREQUENCY_LABELS[c.evidenceFrequency] ?? c.evidenceFrequency,
          },
          { label: 'Status', value: c.status.replace(/_/g, ' ') },
          { label: 'Evidence items', value: String(c.evidenceCount) },
          {
            label: 'Last evidence',
            value: c.lastEvidenceAt ? <DateText value={c.lastEvidenceAt} relative /> : null,
          },
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
