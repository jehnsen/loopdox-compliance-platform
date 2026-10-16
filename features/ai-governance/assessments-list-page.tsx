'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ClipboardCheckIcon } from 'lucide-react'
import { useAssessments } from '@/lib/api/hooks/use-ai'
import type { AiAssessmentSummary } from '@/lib/api/types'
import { DECISION_LABELS, RISK_LABELS } from '@/lib/ai'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { SeverityBadge, StatusPill } from '@/components/status-pill'
import { aiCrumbs, aiPaths } from '@/features/ai-governance/shared'

const FILTER_KEYS = ['status', 'decision', 'risk'] as const

function useColumns(org: string): ColumnDef<AiAssessmentSummary>[] {
  return useMemo(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-24' },
        cell: ({ row }) => <IdChip>{row.original.ref}</IdChip>,
      },
      {
        id: 'useCase',
        header: 'Use case',
        meta: {
          label: 'Use case',
          sortKey: 'useCaseName',
          alwaysVisible: true,
          className: 'min-w-56',
        },
        cell: ({ row }) => (
          <Link
            href={aiPaths.assessment(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {row.original.useCaseRef} {row.original.useCaseName}
          </Link>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'decision',
        header: 'Decision',
        meta: { label: 'Decision' },
        cell: ({ row }) =>
          row.original.decision ? (
            <StatusPill
              status={row.original.decision}
              label={DECISION_LABELS[row.original.decision]}
            />
          ) : (
            <span className="text-muted">Waiting</span>
          ),
      },
      {
        id: 'risk',
        header: 'Risk',
        meta: { label: 'Risk' },
        cell: ({ row }) =>
          row.original.riskLevel ? (
            <SeverityBadge severity={row.original.riskLevel} />
          ) : (
            <span className="text-muted">{RISK_LABELS[row.original.suggestedRisk]} so far</span>
          ),
      },
      {
        id: 'oversight',
        header: 'Human oversight',
        meta: { label: 'Human oversight' },
        cell: ({ row }) =>
          row.original.humanOversight === null
            ? '—'
            : row.original.humanOversight
              ? 'Required'
              : 'Not required',
      },
      {
        id: 'progress',
        header: 'Answered',
        meta: { label: 'Answered', align: 'right' },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.answered} of {row.original.total}
          </span>
        ),
      },
      {
        id: 'decided',
        header: 'Decided',
        meta: { label: 'Decided' },
        cell: ({ row }) =>
          row.original.decidedAt ? (
            <span className="whitespace-nowrap">
              <DateText value={row.original.decidedAt} /> · {row.original.decidedByName}
            </span>
          ) : (
            '—'
          ),
      },
    ],
    [org],
  )
}

export function AssessmentsListPage() {
  const org = useOrgSlug()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useAssessments(org, query)
  const columns = useColumns(org)
  return (
    <div className="flex flex-col">
      <PageHeader
        title="AI assessments"
        breadcrumbs={aiCrumbs({ label: 'Assessments' })}
        description="The questions asked of each use case, the risk level and human oversight decided, and who approved it. Start one from a use case."
      />
      <DataTable
        label="AI assessments"
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
        getRowId={(a) => a.id}
        rowHref={(a) => aiPaths.assessment(org, a.id)}
        searchPlaceholder="Search by ID or use case"
        filters={
          <>
            <FacetFilter
              label="Status"
              options={[
                { value: 'in_progress', label: 'In progress' },
                { value: 'decided', label: 'Decided' },
              ]}
              selected={params.filters.status ?? []}
              onChange={(v) => setParams({ filters: { status: v } })}
            />
            <FacetFilter
              label="Decision"
              options={Object.entries(DECISION_LABELS).map(([value, label]) => ({ value, label }))}
              selected={params.filters.decision ?? []}
              onChange={(v) => setParams({ filters: { decision: v } })}
            />
            <FacetFilter
              label="Risk"
              options={Object.entries(RISK_LABELS).map(([value, label]) => ({ value, label }))}
              selected={params.filters.risk ?? []}
              onChange={(v) => setParams({ filters: { risk: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={ClipboardCheckIcon}
            title="No assessments yet"
            body="Open a use case in the inventory and choose Run assessment. The answers and the decision are kept here."
            actions={
              <Link href={aiPaths.inventory(org)} className="text-accent hover:underline">
                Go to the inventory
              </Link>
            }
          />
        }
      />
    </div>
  )
}
