'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { PlusIcon, UserRoundSearchIcon } from 'lucide-react'
import { useDsrs } from '@/lib/api/hooks/use-privacy'
import type { DsrSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { DSR_STATUS_LABELS, DSR_TYPE_LABELS } from '@/lib/privacy'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug, useSession } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { CalendarDate } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { privacyPaths } from '@/features/privacy/paths'
import { DuePill, privacyCrumbs } from '@/features/privacy/shared'

const FILTER_KEYS = ['status', 'type', 'due', 'open'] as const

function useColumns(org: string): ColumnDef<DsrSummary>[] {
  return useMemo(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-36' },
        cell: ({ row }) => (
          <Link href={privacyPaths.requestView(org, row.original.id)} className="hover:underline">
            <IdChip>{row.original.ref}</IdChip>
          </Link>
        ),
      },
      {
        id: 'type',
        header: 'Request',
        meta: { label: 'Request', sortKey: 'type', alwaysVisible: true },
        cell: ({ row }) => (
          <Link
            href={privacyPaths.requestView(org, row.original.id)}
            className="font-medium whitespace-nowrap hover:text-accent hover:underline"
          >
            {DSR_TYPE_LABELS[row.original.type]}
          </Link>
        ),
      },
      {
        id: 'requester',
        header: 'Requester',
        meta: { label: 'Requester' },
        cell: ({ row }) => (
          <span className="font-mono text-sm whitespace-nowrap text-muted">
            {row.original.requesterName}
          </span>
        ),
      },
      {
        id: 'receivedAt',
        header: 'Received',
        meta: { label: 'Received', sortKey: 'receivedAt' },
        cell: ({ row }) => (
          <CalendarDate value={row.original.receivedAt} className="whitespace-nowrap" />
        ),
      },
      {
        id: 'dueAt',
        header: 'Due',
        meta: { label: 'Due', sortKey: 'dueAt' },
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
            <CalendarDate value={row.original.dueAt} />
            <DuePill state={row.original.dueState} days={row.original.daysLeft} />
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'assignee',
        header: 'Assignee',
        meta: { label: 'Assignee', sortKey: 'assigneeName' },
        cell: ({ row }) =>
          row.original.assigneeName ?? <span className="text-muted">Unassigned</span>,
      },
    ],
    [org],
  )
}

export function DsrListPage() {
  const org = useOrgSlug()
  const { org: orgInfo } = useSession()
  const can = useCan()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useDsrs(org, query)
  const columns = useColumns(org)
  const newButton = can('privacy.edit') ? (
    <Button asChild variant="primary">
      <Link href={privacyPaths.requestNew(org)}>
        <PlusIcon aria-hidden="true" /> New request
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Data subject requests"
        breadcrumbs={privacyCrumbs({ label: 'Data subject requests' })}
        description={`Requests from people about their personal data. Each is due ${orgInfo.settings.dsrResponseDays} days after it’s received (an organisation setting).`}
        actions={newButton}
      />
      <DataTable
        label="Data subject requests"
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
        searchPlaceholder="Search by ID or type"
        rowClassName={(d) =>
          d.dueState === 'overdue'
            ? 'bg-bad-soft/50'
            : d.dueState === 'due_soon'
              ? 'bg-warn-soft/50'
              : d.status === 'closed'
                ? 'text-muted'
                : undefined
        }
        filters={
          <>
            <FacetFilter
              label="Status"
              options={Object.entries(DSR_STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={params.filters.status ?? []}
              onChange={(v) => setParams({ filters: { status: v } })}
            />
            <FacetFilter
              label="Type"
              options={Object.entries(DSR_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              selected={params.filters.type ?? []}
              onChange={(v) => setParams({ filters: { type: v } })}
            />
            <FacetFilter
              label="Due"
              options={[
                { value: 'overdue', label: 'Overdue' },
                { value: 'due_soon', label: 'Due within 7 days' },
              ]}
              selected={params.filters.due ?? []}
              onChange={(v) => setParams({ filters: { due: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={UserRoundSearchIcon}
            title="No data subject requests yet"
            body="Log requests to access, correct or erase personal data here. Each gets a due date and a timeline."
            actions={newButton}
          />
        }
      />
    </div>
  )
}
