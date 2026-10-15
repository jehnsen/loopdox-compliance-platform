'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { DownloadIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react'
import {
  exportQuestionnaire,
  useDeleteQuestionnaire,
  useQuestionnaire,
} from '@/lib/api/hooks/use-questionnaires'
import { isApiError } from '@/lib/api/client'
import { useCan } from '@/lib/auth/can'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState, NotFoundState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { MappingStep } from '@/features/questionnaires/mapping-step'
import { questionnairePaths } from '@/features/questionnaires/paths'
import { ReviewGrid } from '@/features/questionnaires/review-grid'

export function QuestionnairePage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const query = useQuestionnaire(org, id)
  const remove = useDeleteQuestionnaire(org)
  const [exporting, setExporting] = useState(false)
  const [confirm, setConfirm] = useState(false)

  if (query.isLoading) return <Skeleton className="h-96" />
  if (query.isError || !query.data) {
    if (isApiError(query.error) && query.error.isNotFound)
      return <NotFoundState homeHref={questionnairePaths.list(org)} />
    return <ErrorState onRetry={() => void query.refetch()} />
  }
  const q = query.data
  const p = q.progress
  const pct = p.total ? Math.round((p.approved / p.total) * 100) : 0

  const runExport = async () => {
    setExporting(true)
    try {
      await exportQuestionnaire(org, q.id)
      toast.success(
        p.approved === p.total
          ? `Exported ${q.fileName} with every answer approved`
          : `Exported ${q.fileName}. ${p.total - p.approved} answers aren’t approved yet.`,
      )
    } catch (e) {
      toastError(e, 'The export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={q.name}
        breadcrumbs={[
          { label: 'Questionnaires', href: questionnairePaths.list(org) },
          { label: q.name },
        ]}
        status={<StatusPill status={q.status} />}
        description={
          <>
            From {q.client} · {q.fileName} · uploaded <DateText value={q.uploadedAt} relative /> by{' '}
            {q.uploadedByName}
          </>
        }
        actions={
          <>
            {q.status !== 'mapping' ? (
              <Button variant="primary" onClick={() => void runExport()} disabled={exporting}>
                <DownloadIcon aria-hidden="true" />{' '}
                {exporting ? 'Exporting…' : `Export ${q.format.toUpperCase()}`}
              </Button>
            ) : null}
            {can('questionnaires.edit') ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="danger" onSelect={() => setConfirm(true)}>
                    <Trash2Icon /> Delete questionnaire
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
        className="pb-0"
      />
      {q.status === 'mapping' ? (
        can('questionnaires.edit') ? (
          <MappingStep questionnaire={q} />
        ) : (
          <EmptyState
            title="Waiting for the columns to be chosen"
            body="An editor needs to say which column holds the questions before answers are drafted."
          />
        )
      ) : (
        <>
          <section
            aria-label="Progress"
            className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base">
                <span className="font-semibold tabular-nums">
                  {p.approved} of {p.total}
                </span>{' '}
                answers approved
              </p>
              <p className="flex flex-wrap gap-x-4 text-sm text-muted tabular-nums">
                <span>{p.edited} edited</span>
                <span>{p.draft} draft</span>
                <span className={p.needsInput ? 'font-medium text-bad' : undefined}>
                  {p.needsInput} need input
                </span>
              </p>
            </div>
            <Progress
              value={pct}
              aria-label={`${pct}% of answers approved`}
              indicatorClassName={pct === 100 ? 'bg-ok' : undefined}
            />
          </section>
          <ReviewGrid questionnaire={q} />
        </>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this questionnaire?"
        description={`“${q.name}” and every answer drafted for it will be deleted. The client’s original file isn’t affected. This can’t be undone.`}
        confirmLabel="Delete questionnaire"
        destructive
        typedConfirmation="delete"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(q.id, {
            onSuccess: () => {
              toast.success(`Deleted ${q.name}`)
              router.push(questionnairePaths.list(org))
            },
            onError: (e) => toastError(e),
          })
        }
      />
    </div>
  )
}
