'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  ArchiveIcon,
  ClipboardCheckIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react'
import {
  useAssessments,
  useDeleteUseCase,
  useStartAssessment,
  useUpdateUseCase,
  useUseCase,
} from '@/lib/api/hooks/use-ai'
import type { AiUseCaseSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { DECISION_LABELS } from '@/lib/ai'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ActivityFeed } from '@/components/activity-feed'
import { IdChip } from '@/components/chips'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateText } from '@/components/date-text'
import { LinkedRecords } from '@/components/linked-records'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { SeverityBadge, StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { UseCaseForm } from '@/features/ai-governance/use-case-form'
import { aiCrumbs, aiPaths, recordFallback } from '@/features/ai-governance/shared'
import { DetailSkeleton } from '@/features/privacy/shared'

function Assessments({ u }: { u: AiUseCaseSummary }) {
  const org = useOrgSlug()
  const list = useAssessments(org, { useCaseId: u.id, pageSize: 50, sort: '-ref' })
  if (list.isLoading) return <Skeleton className="h-16" />
  const items = list.data?.items ?? []
  if (!items.length) {
    return (
      <p className="text-muted">Not assessed yet. Run an assessment to approve or reject it.</p>
    )
  }
  return (
    <ul className="flex flex-col divide-y divide-line" data-testid="use-case-assessments">
      {items.map((a) => (
        <li
          key={a.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
        >
          <IdChip>{a.ref}</IdChip>
          <Link
            href={aiPaths.assessment(org, a.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {a.status === 'decided' && a.decision ? DECISION_LABELS[a.decision] : 'In progress'}
          </Link>
          {a.riskLevel ? <SeverityBadge severity={a.riskLevel} /> : null}
          <span className="text-sm text-muted">
            {a.status === 'decided' ? (
              <>
                {a.decidedByName} · <DateText value={a.decidedAt} />
              </>
            ) : (
              `${a.answered} of ${a.total} answered`
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function UseCasePage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const query = useUseCase(org, id)
  const start = useStartAssessment(org)
  const update = useUpdateUseCase(org, id)
  const del = useDeleteUseCase(org, id)
  const [confirm, setConfirm] = useState<'delete' | 'retire' | null>(null)

  const fallback = recordFallback(query, aiPaths.inventory(org))
  if (fallback || !query.data) return fallback
  const u = query.data
  const edit = can('ai.edit')
  const retired = u.status === 'retired'

  const setStatus = (status: 'retired' | 'proposed') =>
    update.mutate(
      {
        name: u.name,
        tool: u.tool,
        provider: u.provider,
        model: u.model,
        purpose: u.purpose,
        dataCategories: u.dataCategories,
        riskLevel: u.riskLevel,
        owner: u.owner,
        notes: u.notes,
        ifVersion: u.version,
        status,
      },
      {
        onSuccess: () => {
          toast.success(status === 'retired' ? `Retired ${u.ref}` : `Reopened ${u.ref}`)
          setConfirm(null)
        },
        onError: (e) => {
          setConfirm(null)
          toastError(e)
        },
      },
    )

  const runAssessment = () => {
    if (u.openAssessmentId) {
      router.push(aiPaths.assessment(org, u.openAssessmentId))
      return
    }
    start.mutate(u.id, {
      onSuccess: (a) => router.push(aiPaths.assessment(org, a.id)),
      onError: toastError,
    })
  }

  const latest = u.latestAssessment
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={u.name}
        id={u.ref}
        status={<StatusPill status={u.status} />}
        description={`${u.tool} · ${u.provider} ${u.model}`}
        breadcrumbs={aiCrumbs(
          { label: 'Inventory', href: aiPaths.inventory(org) },
          { label: u.ref },
        )}
        className="pb-0"
        actions={
          edit && !retired ? (
            <>
              <Button variant="secondary" onClick={runAssessment} disabled={start.isPending}>
                <ClipboardCheckIcon aria-hidden="true" />
                {u.assessmentState === 'in_progress'
                  ? 'Continue assessment'
                  : u.assessmentState === 'decided'
                    ? 'Reassess'
                    : 'Run assessment'}
              </Button>
              <Button asChild variant="primary">
                <Link href={aiPaths.useCaseEdit(org, u.id)}>
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
                  <DropdownMenuItem onSelect={() => setConfirm('retire')}>
                    <ArchiveIcon /> Retire use case
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="danger" onSelect={() => setConfirm('delete')}>
                    <Trash2Icon /> Delete use case
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : edit && retired ? (
            <Button
              variant="secondary"
              onClick={() => setStatus('proposed')}
              disabled={update.isPending}
            >
              <RotateCcwIcon aria-hidden="true" /> Reopen
            </Button>
          ) : null
        }
      />
      <MetadataStrip
        items={[
          { label: 'Tool', value: u.tool },
          { label: 'Provider', value: u.provider },
          { label: 'Model', value: u.model },
          { label: 'Risk', value: <SeverityBadge severity={u.riskLevel} /> },
          { label: 'Owner', value: u.ownerName },
          { label: 'Status', value: <StatusPill status={u.status} /> },
        ]}
      />
      {latest && latest.decision === 'approved_with_conditions' ? (
        <ConditionsNotice latest={latest} />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What it is used for</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="whitespace-pre-line">{u.purpose}</p>
              <div>
                <h3 className="label-caps mb-1.5">Data that goes in</h3>
                {u.dataCategories.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {u.dataCategories.map((c) => (
                      <li key={c} className="rounded-md bg-surface-2 px-2 py-0.5 text-sm">
                        {c}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">None listed.</p>
                )}
              </div>
              {u.notes ? <p className="whitespace-pre-line text-muted">{u.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assessments</CardTitle>
            </CardHeader>
            <CardContent>
              <Assessments u={u} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed targetType="ai_use_case" targetId={u.id} />
            </CardContent>
          </Card>
        </div>
        <LinkedRecords type="ai_use_case" id={u.id} title="Linked records" />
      </div>
      <ConfirmDialog
        open={confirm === 'retire'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Retire ${u.ref}?`}
        description="Retire a use case when the tool is no longer used. Its assessments are kept, and you can reopen it later."
        confirmLabel={`Retire ${u.ref}`}
        pending={update.isPending}
        onConfirm={() => setStatus('retired')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${u.ref}?`}
        description="Only a proposed use case that has never been assessed can be deleted. Anything else is retired, so its history stays."
        confirmLabel={`Delete ${u.ref}`}
        destructive
        typedConfirmation={u.ref}
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Deleted ${u.ref}`)
              router.push(aiPaths.inventory(org))
            },
            onError: (e) => {
              setConfirm(null)
              toastError(e)
            },
          })
        }
      />
    </div>
  )
}

/** The conditions an approval came with, so they sit beside the use case, not only in the assessment. */
function ConditionsNotice({
  latest,
}: {
  latest: NonNullable<AiUseCaseSummary['latestAssessment']>
}) {
  const org = useOrgSlug()
  if (!latest.conditions) return null
  return (
    <div
      className="rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-base"
      data-testid="use-case-conditions"
    >
      <p className="font-medium">
        Approved with conditions{latest.humanOversight ? ' · A person checks every output' : ''}
      </p>
      <p className="whitespace-pre-line">{latest.conditions}</p>
      <Link
        href={aiPaths.assessment(org, latest.id)}
        className="text-sm text-accent hover:underline"
      >
        See {latest.ref}
      </Link>
    </div>
  )
}

export function EditUseCasePage({ id }: { id: string }) {
  const org = useOrgSlug()
  const query = useUseCase(org, id)
  if (query.isFetching && !query.isFetchedAfterMount) return <DetailSkeleton />
  const fallback = recordFallback(query, aiPaths.inventory(org))
  if (fallback || !query.data) return fallback
  return <UseCaseForm key={query.data.id} record={query.data} />
}
