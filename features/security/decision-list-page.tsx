'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { FileSignatureIcon, PlusIcon } from 'lucide-react'
import { useDecisions } from '@/lib/api/hooks/use-security'
import type { DecisionSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { DECISION_STATUS_LABELS } from '@/lib/security'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { CalendarDate } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { securityPaths } from '@/features/security/paths'
import { securityCrumbs } from '@/features/security/shared'

const FILTER_KEYS = ['status'] as const

function useColumns(org: string): ColumnDef<DecisionSummary>[] {
  return useMemo(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-24' },
        cell: ({ row }) => <IdChip>{row.original.ref}</IdChip>,
      },
      {
        id: 'title',
        header: 'Decision',
        meta: { label: 'Decision', sortKey: 'title', alwaysVisible: true, className: 'min-w-64' },
        cell: ({ row }) => (
          <Link
            href={securityPaths.decisionView(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => {
          const d = row.original
          return (
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusPill status={d.status} />
              {d.supersededByRef ? (
                <span className="text-sm text-muted">by {d.supersededByRef}</span>
              ) : null}
            </span>
          )
        },
      },
      {
        id: 'decidedBy',
        header: 'Decided by',
        meta: { label: 'Decided by', sortKey: 'decidedByName' },
        cell: ({ row }) => row.original.decidedByName,
      },
      {
        id: 'decidedAt',
        header: 'Decided',
        meta: { label: 'Decided', sortKey: 'decidedAt' },
        cell: ({ row }) => (
          <CalendarDate value={row.original.decidedAt} className="whitespace-nowrap" />
        ),
      },
      {
        id: 'systems',
        header: 'Systems',
        meta: { label: 'Systems', align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.systemIds.length}</span>,
      },
    ],
    [org],
  )
}

export function DecisionListPage() {
  const org = useOrgSlug()
  const can = useCan()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useDecisions(org, query)
  const columns = useColumns(org)
  const newButton = can('security.edit') ? (
    <Button asChild variant="primary">
      <Link href={securityPaths.decisionNew(org)}>
        <PlusIcon aria-hidden="true" /> New decision
      </Link>
    </Button>
  ) : null
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Decisions"
        breadcrumbs={securityCrumbs({ label: 'Decisions' })}
        description="Architecture decision records: the context, the choice and what follows from it, so the reasoning outlives the people who made it."
        actions={newButton}
      />
      <DataTable
        label="Decisions"
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
        getRowId={(d) => d.id}
        rowHref={(d) => securityPaths.decisionView(org, d.id)}
        searchPlaceholder="Search by ID or words in the decision"
        filters={
          <FacetFilter
            label="Status"
            options={Object.entries(DECISION_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            selected={params.filters.status ?? []}
            onChange={(v) => setParams({ filters: { status: v } })}
          />
        }
        emptyState={
          <EmptyState
            icon={FileSignatureIcon}
            title="No decisions recorded yet"
            body="Write down significant technical choices (where secrets live, how data is isolated) with their context and consequences."
            actions={newButton}
          />
        }
      />
    </div>
  )
}
