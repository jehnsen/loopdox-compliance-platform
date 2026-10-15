'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ListChecksIcon, UploadIcon } from 'lucide-react'
import { useControls } from '@/lib/api/hooks/use-evidence'
import type { ControlSummary, Framework } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { FRAMEWORK_ORDER, FREQUENCY_LABELS } from '@/lib/evidence'
import { FRAMEWORK_LABELS } from '@/lib/overview'
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
import { evidenceCrumbs, evidencePaths } from '@/features/evidence/shared'
import { UploadEvidenceDialog } from '@/features/evidence/upload-evidence-dialog'

const FILTER_KEYS = ['framework', 'status'] as const

const STATUS_OPTIONS = [
  { value: 'failing', label: 'Failing' },
  { value: 'no_evidence', label: 'No evidence' },
  { value: 'passing', label: 'Passing' },
  { value: 'not_applicable', label: 'Not applicable' },
]

function useColumns(org: string): ColumnDef<ControlSummary>[] {
  return useMemo(
    () => [
      {
        id: 'reference',
        header: 'Control',
        meta: { label: 'Control', sortKey: 'reference', alwaysVisible: true, className: 'w-40' },
        cell: ({ row }) => <IdChip>{row.original.reference}</IdChip>,
      },
      {
        id: 'title',
        header: 'Title',
        meta: { label: 'Title', sortKey: 'title', alwaysVisible: true, className: 'min-w-64' },
        cell: ({ row }) => (
          <Link
            href={evidencePaths.control(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'framework',
        header: 'Framework',
        meta: { label: 'Framework', sortKey: 'framework' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{FRAMEWORK_LABELS[row.original.framework]}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner', sortKey: 'ownerName' },
        cell: ({ row }) => row.original.ownerName,
      },
      {
        id: 'frequency',
        header: 'Evidence due',
        meta: { label: 'Evidence due', sortKey: 'evidenceFrequency' },
        cell: ({ row }) => FREQUENCY_LABELS[row.original.evidenceFrequency],
      },
      {
        id: 'lastEvidence',
        header: 'Last evidence',
        meta: { label: 'Last evidence', sortKey: 'lastEvidenceAt' },
        cell: ({ row }) =>
          row.original.lastEvidenceAt ? (
            <DateText value={row.original.lastEvidenceAt} relative className="whitespace-nowrap" />
          ) : (
            <span className="text-muted">None yet</span>
          ),
      },
      {
        id: 'evidenceCount',
        header: 'Items',
        meta: { label: 'Evidence items', align: 'right', sortKey: 'evidenceCount' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.evidenceCount}</span>,
      },
      {
        id: 'policies',
        header: 'Policies',
        meta: { label: 'Policies', align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.documentIds.length}</span>,
      },
    ],
    [org],
  )
}

export function ControlsPage() {
  const org = useOrgSlug()
  const can = useCan()
  const [uploading, setUploading] = useState(false)
  const { params, setParams, query } = useListParams({
    filterKeys: FILTER_KEYS,
    defaultPageSize: 50,
  })
  const list = useControls(org, query)
  const columns = useColumns(org)
  const upload = can('evidence.edit') ? (
    <Button variant="primary" onClick={() => setUploading(true)}>
      <UploadIcon aria-hidden="true" /> Upload evidence
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Controls"
        breadcrumbs={evidenceCrumbs({ label: 'Controls' })}
        description="What each framework asks for, the policies that answer it, and the evidence that shows it working."
        actions={upload}
      />
      {uploading ? <UploadEvidenceDialog onClose={() => setUploading(false)} /> : null}
      <DataTable
        label="Controls"
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
        getRowId={(c) => c.id}
        searchPlaceholder="Search by reference or title"
        // Grouped by framework while the order is the server's default; any sort flattens it.
        groupBy={
          params.sort
            ? null
            : {
                key: (c) => c.framework,
                heading: (key) => FRAMEWORK_LABELS[key as Framework],
              }
        }
        filters={
          <>
            <FacetFilter
              label="Framework"
              options={FRAMEWORK_ORDER.map((f) => ({ value: f, label: FRAMEWORK_LABELS[f] }))}
              selected={params.filters.framework ?? []}
              onChange={(v) => setParams({ filters: { framework: v } })}
            />
            <FacetFilter
              label="Status"
              options={STATUS_OPTIONS}
              selected={params.filters.status ?? []}
              onChange={(v) => setParams({ filters: { status: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={ListChecksIcon}
            title="No controls yet"
            body="Controls from ISO/IEC 27001, the Data Privacy Act and NPC issuances appear here once your plan’s framework set is loaded."
          />
        }
      />
    </div>
  )
}
