'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ClipboardCheckIcon, PlusIcon } from 'lucide-react'
import { useAccessReviews } from '@/lib/api/hooks/use-security'
import type { AccessReviewSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { CalendarDate, DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { securityPaths } from '@/features/security/paths'
import { DuePill, securityCrumbs } from '@/features/security/shared'

const FILTER_KEYS = ['status'] as const

function useColumns(org: string): ColumnDef<AccessReviewSummary>[] {
  return useMemo(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-24' },
        cell: ({ row }) => <IdChip>{row.original.ref}</IdChip>,
      },
      {
        id: 'period',
        header: 'Period',
        meta: { label: 'Period', sortKey: 'period', alwaysVisible: true },
        cell: ({ row }) => (
          <Link
            href={securityPaths.reviewView(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            Access review {row.original.period}
          </Link>
        ),
      },
      {
        id: 'systems',
        header: 'Systems',
        meta: { label: 'Systems', className: 'min-w-48' },
        cell: ({ row }) => (
          <span title={row.original.systemNames.join(', ')}>
            {row.original.systemNames.length}{' '}
            {row.original.systemNames.length === 1 ? 'system' : 'systems'}
          </span>
        ),
      },
      {
        id: 'reviewer',
        header: 'Reviewer',
        meta: { label: 'Reviewer' },
        cell: ({ row }) => row.original.reviewerName,
      },
      {
        id: 'progress',
        header: 'Progress',
        meta: { label: 'Progress', className: 'min-w-40' },
        cell: ({ row }) => {
          const r = row.original
          return (
            <span className="flex items-center gap-2">
              <Progress
                value={r.total ? (r.decided / r.total) * 100 : 0}
                className="w-24"
                aria-label={`${r.decided} of ${r.total} decided`}
              />
              <span className="text-sm whitespace-nowrap tabular-nums">
                {r.decided} / {r.total}
              </span>
            </span>
          )
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => {
          const r = row.original
          return r.status === 'signed_off' ? (
            <StatusPill status="signed_off" />
          ) : (
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusPill status="in_progress" />
              <DuePill state={r.dueState} days={r.daysLeft} />
            </span>
          )
        },
      },
      {
        id: 'dueAt',
        header: 'Period ends',
        meta: { label: 'Period ends', sortKey: 'dueAt' },
        cell: ({ row }) =>
          row.original.signedOffAt ? (
            <span className="whitespace-nowrap">
              Signed <DateText value={row.original.signedOffAt} />
            </span>
          ) : (
            <CalendarDate value={row.original.dueAt} className="whitespace-nowrap" />
          ),
      },
    ],
    [org],
  )
}

export function ReviewListPage() {
  const org = useOrgSlug()
  const can = useCan()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useAccessReviews(org, query)
  const columns = useColumns(org)
  const newButton = can('security.edit') ? (
    <Button asChild variant="primary">
      <Link href={securityPaths.reviewNew(org)}>
        <PlusIcon aria-hidden="true" /> Start a review
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Access reviews"
        breadcrumbs={securityCrumbs({ label: 'Access reviews' })}
        description="Each quarter, confirm that everyone with access still needs it. Signing off records evidence for the access control."
        actions={newButton}
      />
      <DataTable
        label="Access reviews"
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
        getRowId={(r) => r.id}
        searchPlaceholder="Search by ID or period"
        filters={
          <FacetFilter
            label="Status"
            options={[
              { value: 'in_progress', label: 'In progress' },
              { value: 'signed_off', label: 'Signed off' },
            ]}
            selected={params.filters.status ?? []}
            onChange={(v) => setParams({ filters: { status: v } })}
          />
        }
        emptyState={
          <EmptyState
            icon={ClipboardCheckIcon}
            title="No access reviews yet"
            body="Start a review for this quarter. It lists every access grant on the systems you choose, and you decide to keep, revoke or change each one."
            actions={newButton}
          />
        }
      />
    </div>
  )
}
