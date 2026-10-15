'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { BotIcon, PlusIcon } from 'lucide-react'
import { useUseCases } from '@/lib/api/hooks/use-ai'
import type { AiUseCaseSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { DECISION_LABELS, RISK_LABELS, USE_CASE_STATUS_LABELS } from '@/lib/ai'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { SeverityBadge, StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { aiCrumbs, aiPaths } from '@/features/ai-governance/shared'

const FILTER_KEYS = ['status', 'risk', 'assessment'] as const

const ASSESSMENT_OPTIONS = [
  { value: 'none', label: 'Not assessed' },
  { value: 'in_progress', label: 'Assessment in progress' },
  { value: 'decided', label: 'Assessed' },
]

function AssessmentCell({ u }: { u: AiUseCaseSummary }) {
  if (u.assessmentState === 'in_progress') return <span className="text-warn">In progress</span>
  if (u.latestAssessment) {
    return <span>{DECISION_LABELS[u.latestAssessment.decision]}</span>
  }
  return <span className="text-muted">Not assessed</span>
}

function useColumns(org: string): ColumnDef<AiUseCaseSummary>[] {
  return useMemo(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-24' },
        cell: ({ row }) => <IdChip>{row.original.ref}</IdChip>,
      },
      {
        id: 'name',
        header: 'Use case',
        meta: { label: 'Use case', sortKey: 'name', alwaysVisible: true, className: 'min-w-56' },
        cell: ({ row }) => (
          <Link
            href={aiPaths.useCase(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'tool',
        header: 'Tool',
        meta: { label: 'Tool', sortKey: 'tool' },
        cell: ({ row }) => row.original.tool,
      },
      {
        id: 'provider',
        header: 'Provider',
        meta: { label: 'Provider', sortKey: 'provider' },
        cell: ({ row }) => row.original.provider,
      },
      {
        id: 'model',
        header: 'Model',
        meta: { label: 'Model', sortKey: 'model' },
        cell: ({ row }) => row.original.model,
      },
      {
        id: 'data',
        header: 'Data categories',
        meta: { label: 'Data categories', className: 'min-w-48' },
        cell: ({ row }) => (
          <span className="line-clamp-2">{row.original.dataCategories.join(', ') || '—'}</span>
        ),
      },
      {
        id: 'risk',
        header: 'Risk',
        meta: { label: 'Risk', sortKey: 'riskLevel' },
        cell: ({ row }) => <SeverityBadge severity={row.original.riskLevel} />,
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner', sortKey: 'ownerName' },
        cell: ({ row }) => row.original.ownerName,
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'assessment',
        header: 'Assessment',
        meta: { label: 'Assessment' },
        cell: ({ row }) => <AssessmentCell u={row.original} />,
      },
    ],
    [org],
  )
}

export function InventoryListPage() {
  const org = useOrgSlug()
  const can = useCan()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useUseCases(org, query)
  const columns = useColumns(org)
  const add = can('ai.edit') ? (
    <Button asChild variant="primary">
      <Link href={aiPaths.useCaseNew(org)}>
        <PlusIcon aria-hidden="true" /> New use case
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="AI inventory"
        breadcrumbs={aiCrumbs({ label: 'Inventory' })}
        description="Every way the organisation uses AI: the tool, the provider and model behind it, what data goes in, and who answers for it."
        actions={add}
      />
      <DataTable
        label="AI use cases"
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
        getRowId={(u) => u.id}
        searchPlaceholder="Search by ID, name, tool or provider"
        filters={
          <>
            <FacetFilter
              label="Status"
              options={Object.entries(USE_CASE_STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={params.filters.status ?? []}
              onChange={(v) => setParams({ filters: { status: v } })}
            />
            <FacetFilter
              label="Risk"
              options={Object.entries(RISK_LABELS).map(([value, label]) => ({ value, label }))}
              selected={params.filters.risk ?? []}
              onChange={(v) => setParams({ filters: { risk: v } })}
            />
            <FacetFilter
              label="Assessment"
              options={ASSESSMENT_OPTIONS}
              selected={params.filters.assessment ?? []}
              onChange={(v) => setParams({ filters: { assessment: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={BotIcon}
            title="No AI use cases yet"
            body="Add each tool or app that sends data to an AI model. Then assess it, so you can show it was approved on purpose."
            actions={add}
          />
        }
      />
    </div>
  )
}
