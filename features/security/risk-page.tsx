'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useDeleteRisk, useRisk } from '@/lib/api/hooks/use-security'
import { useCan } from '@/lib/auth/can'
import { IMPACT_LABELS, LIKELIHOOD_LABELS } from '@/lib/risk'
import { TREATMENT_LABELS } from '@/lib/security'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ActivityFeed } from '@/components/activity-feed'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CalendarDate } from '@/components/date-text'
import { LinkedRecords } from '@/components/linked-records'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { ScoreBadge } from '@/components/risk-matrix'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { securityPaths } from '@/features/security/paths'
import { DetailSkeleton, DuePill, recordFallback, securityCrumbs } from '@/features/security/shared'
import { RiskForm } from '@/features/security/risk-form'

export function RiskPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const query = useRisk(org, id)
  const del = useDeleteRisk(org, id)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fallback = recordFallback(query, securityPaths.risks(org))
  if (fallback || !query.data) return fallback
  const r = query.data
  const edit = can('security.edit')

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={r.title}
        id={r.ref}
        status={
          <span className="flex items-center gap-1.5">
            <StatusPill status={r.status} />
            <DuePill state={r.reviewState} days={r.daysToReview} verb="Review" />
          </span>
        }
        breadcrumbs={securityCrumbs(
          { label: 'Risks', href: securityPaths.risks(org) },
          { label: r.ref },
        )}
        className="pb-0"
        actions={
          edit ? (
            <>
              <Button asChild variant="primary">
                <Link href={securityPaths.riskEdit(org, r.id)}>
                  <PencilIcon aria-hidden="true" /> Edit
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="danger" onSelect={() => setConfirmDelete(true)}>
                    <Trash2Icon /> Delete risk
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null
        }
      />
      <MetadataStrip
        items={[
          { label: 'Inherent', value: <ScoreBadge score={r.inherentScore} /> },
          { label: 'Residual', value: <ScoreBadge score={r.residualScore} /> },
          { label: 'Treatment', value: TREATMENT_LABELS[r.treatment] },
          { label: 'Owner', value: r.ownerName },
          { label: 'Next review', value: <CalendarDate value={r.reviewAt} /> },
          { label: 'Status', value: r.status === 'open' ? 'Open' : 'Closed' },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {r.description ? (
                <p className="whitespace-pre-line">{r.description}</p>
              ) : (
                <p className="text-muted">No description.</p>
              )}
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-muted">Likelihood</dt>
                  <dd>
                    {r.likelihood} · {LIKELIHOOD_LABELS[r.likelihood]}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted">Impact</dt>
                  <dd>
                    {r.impact} · {IMPACT_LABELS[r.impact]}
                  </dd>
                </div>
                {r.residualLikelihood && r.residualImpact ? (
                  <>
                    <div className="flex gap-2">
                      <dt className="text-muted">Residual likelihood</dt>
                      <dd>
                        {r.residualLikelihood} · {LIKELIHOOD_LABELS[r.residualLikelihood]}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Residual impact</dt>
                      <dd>
                        {r.residualImpact} · {IMPACT_LABELS[r.residualImpact]}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed targetType="risk" targetId={r.id} />
            </CardContent>
          </Card>
        </div>
        <LinkedRecords type="risk" id={r.id} />
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${r.ref}?`}
        description="The risk is removed from the register and unlinked from incidents, policies and controls. Close it instead if you want to keep the history. This can’t be undone."
        confirmLabel={`Delete ${r.ref}`}
        destructive
        typedConfirmation={r.ref}
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Deleted ${r.ref}`)
              router.push(securityPaths.risks(org))
            },
            onError: (e) => {
              setConfirmDelete(false)
              toastError(e)
            },
          })
        }
      />
    </div>
  )
}

export function EditRiskPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const query = useRisk(org, id, true)
  if (query.isFetching && !query.isFetchedAfterMount) return <DetailSkeleton />
  const fallback = recordFallback(query, securityPaths.risks(org))
  if (fallback || !query.data) return fallback
  return <RiskForm key={query.data.id} record={query.data} />
}
