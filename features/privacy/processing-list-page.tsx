'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DatabaseIcon, PlusIcon } from 'lucide-react'
import { useProcessingActivities } from '@/lib/api/hooks/use-privacy'
import { orgPath } from '@/lib/api/client'
import type { ProcessingActivitySummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { LEGAL_BASIS_LABELS, PROCESSING_WARNING_LABELS } from '@/lib/privacy'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { privacyPaths } from '@/features/privacy/paths'
import { privacyCrumbs, SensitiveChip, WarningChip } from '@/features/privacy/shared'

const FILTER_KEYS = ['status', 'legalBasis', 'warning', 'sensitive'] as const

function useColumns(org: string): ColumnDef<ProcessingActivitySummary>[] {
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
        header: 'Activity',
        meta: { label: 'Activity', sortKey: 'name', alwaysVisible: true, className: 'min-w-56' },
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <Link
              href={privacyPaths.processingView(org, row.original.id)}
              className="font-medium hover:text-accent hover:underline"
            >
              {row.original.name}
            </Link>
            {row.original.hasSensitive ? <SensitiveChip /> : null}
          </span>
        ),
      },
      {
        id: 'legalBasis',
        header: 'Legal basis',
        meta: { label: 'Legal basis', sortKey: 'legalBasis' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{LEGAL_BASIS_LABELS[row.original.legalBasis]}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'warnings',
        header: 'Needs attention',
        meta: { label: 'Needs attention' },
        cell: ({ row }) =>
          row.original.warnings.length ? (
            <span className="flex flex-wrap gap-1">
              {row.original.warnings.map((w) => (
                <WarningChip key={w}>{PROCESSING_WARNING_LABELS[w]}</WarningChip>
              ))}
            </span>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner', sortKey: 'ownerName' },
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.ownerName}</span>,
      },
      {
        id: 'updatedAt',
        header: 'Last edited',
        meta: { label: 'Last edited', sortKey: 'updatedAt' },
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

export function ProcessingListPage() {
  const org = useOrgSlug()
  const can = useCan()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useProcessingActivities(org, query)
  const columns = useColumns(org)

  const newButton = can('privacy.edit') ? (
    <Button asChild variant="primary">
      <Link href={privacyPaths.processingNew(org)}>
        <PlusIcon aria-hidden="true" /> New processing record
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Processing records"
        breadcrumbs={privacyCrumbs({ label: 'Processing records' })}
        description="What personal data the organisation processes, why, on what legal basis, and who receives it."
        actions={newButton}
      />
      <DataTable
        label="Processing records"
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
        rowHref={(p) => privacyPaths.processingView(org, p.id)}
        searchPlaceholder="Search by ID, name or purpose"
        exportPath={orgPath(org, '/processing-activities/export')}
        rowClassName={(p) => (p.status === 'retired' ? 'text-muted' : undefined)}
        filters={
          <>
            <FacetFilter
              label="Status"
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'approved', label: 'Approved' },
                { value: 'retired', label: 'Retired' },
              ]}
              selected={params.filters.status ?? []}
              onChange={(v) => setParams({ filters: { status: v } })}
            />
            <FacetFilter
              label="Legal basis"
              options={Object.entries(LEGAL_BASIS_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={params.filters.legalBasis ?? []}
              onChange={(v) => setParams({ filters: { legalBasis: v } })}
            />
            <FacetFilter
              label="Needs attention"
              options={Object.entries(PROCESSING_WARNING_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={params.filters.warning ?? []}
              onChange={(v) => setParams({ filters: { warning: v } })}
            />
            <FacetFilter
              label="Data"
              options={[{ value: 'true', label: 'Includes sensitive personal information' }]}
              selected={params.filters.sensitive ?? []}
              onChange={(v) => setParams({ filters: { sensitive: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={DatabaseIcon}
            title="No processing records yet"
            body="Record each activity that uses personal data: what you collect, why, on what legal basis, who receives it and how long you keep it."
            actions={newButton}
          />
        }
      />
    </div>
  )
}
