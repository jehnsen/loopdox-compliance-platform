'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { HandshakeIcon, PaperclipIcon, PlusIcon } from 'lucide-react'
import { useAgreements } from '@/lib/api/hooks/use-privacy'
import type { AgreementSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { AGREEMENT_ROLE_LABELS, AGREEMENT_TYPE_LABELS, AGREEMENT_TYPE_SHORT } from '@/lib/privacy'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { CalendarDate } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { privacyPaths } from '@/features/privacy/paths'
import { DuePill, privacyCrumbs } from '@/features/privacy/shared'

const FILTER_KEYS = ['type', 'role', 'renewal'] as const

function useColumns(org: string): ColumnDef<AgreementSummary>[] {
  return useMemo(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-24' },
        cell: ({ row }) => <IdChip>{row.original.ref}</IdChip>,
      },
      {
        id: 'counterparty',
        header: 'Counterparty',
        meta: {
          label: 'Counterparty',
          sortKey: 'counterparty',
          alwaysVisible: true,
          className: 'min-w-48',
        },
        cell: ({ row }) => (
          <Link
            href={privacyPaths.agreementView(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {row.original.counterparty}
          </Link>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type', sortKey: 'type' },
        cell: ({ row }) => (
          <span title={AGREEMENT_TYPE_LABELS[row.original.type]}>
            {AGREEMENT_TYPE_SHORT[row.original.type]}
          </span>
        ),
      },
      {
        id: 'role',
        header: 'Our role',
        meta: { label: 'Our role', sortKey: 'role' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{AGREEMENT_ROLE_LABELS[row.original.role]}</span>
        ),
      },
      {
        id: 'signedAt',
        header: 'Signed',
        meta: { label: 'Signed', sortKey: 'signedAt' },
        cell: ({ row }) => (
          <CalendarDate value={row.original.signedAt} className="whitespace-nowrap" />
        ),
      },
      {
        id: 'renewsAt',
        header: 'Renews',
        meta: { label: 'Renews', sortKey: 'renewsAt' },
        cell: ({ row }) =>
          row.original.renewsAt ? (
            <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
              <CalendarDate value={row.original.renewsAt} />
              <DuePill
                state={row.original.renewalState}
                days={row.original.daysToRenewal}
                verb="Renews"
              />
            </span>
          ) : (
            <span className="text-muted">No fixed term</span>
          ),
      },
      {
        id: 'file',
        header: 'File',
        meta: { label: 'File' },
        cell: ({ row }) =>
          row.original.file ? (
            <span className="inline-flex items-center gap-1 text-sm" title={row.original.file.name}>
              <PaperclipIcon className="size-3.5" aria-hidden="true" /> Attached
            </span>
          ) : (
            <span className="text-sm text-muted">None</span>
          ),
      },
      {
        id: 'linked',
        header: 'Processing records',
        meta: { label: 'Processing records', align: 'right' },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.processingActivityIds.length}</span>
        ),
      },
    ],
    [org],
  )
}

export function AgreementListPage() {
  const org = useOrgSlug()
  const can = useCan()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useAgreements(org, query)
  const columns = useColumns(org)
  const newButton = can('privacy.edit') ? (
    <Button asChild variant="primary">
      <Link href={privacyPaths.agreementNew(org)}>
        <PlusIcon aria-hidden="true" /> New agreement
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Agreements"
        breadcrumbs={privacyCrumbs({ label: 'Agreements' })}
        description="Data processing, data sharing and related agreements with clients and vendors, and when each renews."
        actions={newButton}
      />
      <DataTable
        label="Agreements"
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
        rowHref={(a) => privacyPaths.agreementView(org, a.id)}
        searchPlaceholder="Search by ID or counterparty"
        rowClassName={(a) =>
          a.renewalState === 'overdue'
            ? 'bg-bad-soft/50'
            : a.renewalState === 'due_soon'
              ? 'bg-warn-soft/50'
              : undefined
        }
        filters={
          <>
            <FacetFilter
              label="Type"
              options={Object.entries(AGREEMENT_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={params.filters.type ?? []}
              onChange={(v) => setParams({ filters: { type: v } })}
            />
            <FacetFilter
              label="Our role"
              options={Object.entries(AGREEMENT_ROLE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={params.filters.role ?? []}
              onChange={(v) => setParams({ filters: { role: v } })}
            />
            <FacetFilter
              label="Renewal"
              options={[
                { value: 'due_soon', label: 'Within 30 days' },
                { value: 'overdue', label: 'Expired' },
              ]}
              selected={params.filters.renewal ?? []}
              onChange={(v) => setParams({ filters: { renewal: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={HandshakeIcon}
            title="No agreements yet"
            body="Record data processing and sharing agreements, attach the signed copy, and link the processing records they cover."
            actions={newButton}
          />
        }
      />
    </div>
  )
}
