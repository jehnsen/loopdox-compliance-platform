'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ClipboardListIcon, UploadIcon } from 'lucide-react'
import { useQuestionnaires } from '@/lib/api/hooks/use-questionnaires'
import type { QuestionnaireSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { QUESTIONNAIRE_STATUS_LABELS } from '@/lib/questionnaires'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { questionnairePaths } from '@/features/questionnaires/paths'

const FILTER_KEYS = ['status'] as const

export function QuestionnaireProgressBar({ approved, total }: { approved: number; total: number }) {
  const pct = total ? Math.round((approved / total) * 100) : 0
  return (
    <span className="flex min-w-36 items-center gap-2">
      <Progress
        value={pct}
        className="h-1.5 w-20"
        aria-label={`${approved} of ${total} answers approved`}
        indicatorClassName={pct === 100 ? 'bg-ok' : undefined}
      />
      <span className="text-sm whitespace-nowrap text-muted tabular-nums">
        {approved} of {total}
      </span>
    </span>
  )
}

export function QuestionnaireListPage() {
  const org = useOrgSlug()
  const can = useCan()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useQuestionnaires(org, query)
  const columns = useMemo<ColumnDef<QuestionnaireSummary>[]>(
    () => [
      {
        id: 'name',
        header: 'Questionnaire',
        meta: {
          label: 'Questionnaire',
          sortKey: 'name',
          alwaysVisible: true,
          className: 'min-w-56',
        },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <Link
              href={questionnairePaths.view(org, row.original.id)}
              className="font-medium hover:text-accent hover:underline"
            >
              {row.original.name}
            </Link>
            <span className="text-xs text-muted">{row.original.fileName}</span>
          </span>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        meta: { label: 'Client', sortKey: 'client' },
        cell: ({ row }) => row.original.client,
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'progress',
        header: 'Approved',
        meta: { label: 'Approved' },
        cell: ({ row }) =>
          row.original.status === 'mapping' ? (
            <span className="text-sm text-muted">Not drafted yet</span>
          ) : (
            <QuestionnaireProgressBar
              approved={row.original.progress.approved}
              total={row.original.progress.total}
            />
          ),
      },
      {
        id: 'uploadedAt',
        header: 'Uploaded',
        meta: { label: 'Uploaded', sortKey: 'uploadedAt' },
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap text-muted">
            <DateText value={row.original.uploadedAt} relative /> by {row.original.uploadedByName}
          </span>
        ),
      },
    ],
    [org],
  )
  const upload = can('questionnaires.edit') ? (
    <Button asChild variant="primary">
      <Link href={questionnairePaths.upload(org)}>
        <UploadIcon aria-hidden="true" /> Upload questionnaire
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Questionnaires"
        description="Client security questionnaires, answered from your approved policies with sources, then reviewed and exported."
        actions={upload}
      />
      <DataTable
        label="Questionnaires"
        columns={columns}
        data={list.data}
        isLoading={list.isLoading}
        isFetching={list.isFetching}
        isError={list.isError}
        error={list.error}
        onRetry={() => void list.refetch()}
        params={params}
        setParams={setParams}
        query={query}
        getRowId={(q) => q.id}
        searchPlaceholder="Search by name, client or file"
        filters={
          <FacetFilter
            label="Status"
            options={(['mapping', 'in_review', 'complete'] as const).map((s) => ({
              value: s,
              label: QUESTIONNAIRE_STATUS_LABELS[s],
            }))}
            selected={params.filters.status ?? []}
            onChange={(v) => setParams({ filters: { status: v } })}
          />
        }
        emptyState={
          <EmptyState
            icon={ClipboardListIcon}
            title="No questionnaires yet"
            body="Upload a client’s security questionnaire as CSV or Excel. LoopDox drafts each answer from your approved policies, with sources, for you to review."
            actions={upload}
          />
        }
      />
    </div>
  )
}
