'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { PlusIcon, ScaleIcon } from 'lucide-react'
import { usePias } from '@/lib/api/hooks/use-privacy'
import type { PiaSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { PIA_DECISION_LABELS, PIA_STEPS } from '@/lib/privacy'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { ScoreBadge } from '@/components/risk-matrix'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { privacyPaths } from '@/features/privacy/paths'
import { privacyCrumbs } from '@/features/privacy/shared'

const FILTER_KEYS = ['status', 'decision'] as const

function useColumns(org: string): ColumnDef<PiaSummary>[] {
  return useMemo(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-24' },
        cell: ({ row }) => <IdChip>{row.original.ref}</IdChip>,
      },
      {
        id: 'activity',
        header: 'Processing activity',
        meta: {
          label: 'Processing activity',
          sortKey: 'processingActivityName',
          alwaysVisible: true,
        },
        cell: ({ row }) => (
          <Link
            href={privacyPaths.piaView(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {row.original.processingActivityRef ? (
              <span className="mr-1.5 font-mono text-sm text-muted">
                {row.original.processingActivityRef}
              </span>
            ) : null}
            {row.original.processingActivityName ?? 'Processing activity'}
          </Link>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) =>
          row.original.status === 'signed_off' ? (
            <StatusPill status="signed_off" />
          ) : (
            <StatusPill
              status="in_progress"
              label={`Step ${row.original.currentStep} of 5: ${PIA_STEPS[row.original.currentStep - 1]}`}
            />
          ),
      },
      {
        id: 'score',
        header: 'Overall score',
        meta: { label: 'Overall score', sortKey: 'overallScore' },
        cell: ({ row }) => <ScoreBadge score={row.original.overallScore} />,
      },
      {
        id: 'decision',
        header: 'Decision',
        meta: { label: 'Decision', sortKey: 'decision' },
        cell: ({ row }) =>
          row.original.decision ? (
            PIA_DECISION_LABELS[row.original.decision]
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        id: 'updatedAt',
        header: 'Last saved',
        meta: { label: 'Last saved', sortKey: 'updatedAt' },
        cell: ({ row }) => (
          <DateText
            value={row.original.updatedAt}
            relative
            className="whitespace-nowrap text-muted"
          />
        ),
      },
    ],
    [org],
  )
}

export function PiaListPage() {
  const org = useOrgSlug()
  const can = useCan()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = usePias(org, query)
  const columns = useColumns(org)
  const newButton = can('privacy.edit') ? (
    <Button asChild variant="primary">
      <Link href={privacyPaths.piaNew(org)}>
        <PlusIcon aria-hidden="true" /> New impact assessment
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Impact assessments"
        breadcrumbs={privacyCrumbs({ label: 'Impact assessments' })}
        description="Privacy impact assessments: the risks of a processing activity, how they’re mitigated, and the decision."
        actions={newButton}
      />
      <DataTable
        label="Impact assessments"
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
        getRowId={(p) => p.id}
        rowHref={(p) => privacyPaths.piaView(org, p.id)}
        searchPlaceholder="Search by ID, activity or scope"
        filters={
          <>
            <FacetFilter
              label="Status"
              options={[
                { value: 'in_progress', label: 'In progress' },
                { value: 'signed_off', label: 'Signed off' },
              ]}
              selected={params.filters.status ?? []}
              onChange={(v) => setParams({ filters: { status: v } })}
            />
            <FacetFilter
              label="Decision"
              options={Object.entries(PIA_DECISION_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={params.filters.decision ?? []}
              onChange={(v) => setParams({ filters: { decision: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={ScaleIcon}
            title="No impact assessments yet"
            body="Assess a processing activity in five steps: scope, data flows, risks, mitigations, and a signed-off decision."
            actions={newButton}
          />
        }
      />
    </div>
  )
}
