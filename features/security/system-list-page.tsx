'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { PlusIcon, ServerIcon } from 'lucide-react'
import { useSystems } from '@/lib/api/hooks/use-security'
import type { SystemSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { SYSTEM_TYPE_LABELS } from '@/lib/security'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { useClassificationLabel } from '@/components/form/classification-select'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { securityPaths } from '@/features/security/paths'
import { securityCrumbs } from '@/features/security/shared'

const FILTER_KEYS = ['type', 'classification', 'personalData'] as const

function useColumns(org: string): ColumnDef<SystemSummary>[] {
  const classLabel = useClassificationLabel()
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
        header: 'System',
        meta: { label: 'System', sortKey: 'name', alwaysVisible: true, className: 'min-w-56' },
        cell: ({ row }) => (
          <Link
            href={securityPaths.systemView(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type', sortKey: 'type' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{SYSTEM_TYPE_LABELS[row.original.type]}</span>
        ),
      },
      {
        id: 'provider',
        header: 'Provider',
        meta: { label: 'Provider', sortKey: 'provider' },
        cell: ({ row }) => row.original.provider,
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner', sortKey: 'ownerName' },
        cell: ({ row }) => row.original.ownerName,
      },
      {
        id: 'classification',
        header: 'Classification',
        meta: { label: 'Classification', sortKey: 'classification' },
        cell: ({ row }) => classLabel(row.original.classification),
      },
      {
        id: 'personalData',
        header: 'Personal data',
        meta: { label: 'Personal data', sortKey: 'holdsPersonalData' },
        cell: ({ row }) =>
          row.original.holdsPersonalData ? (
            <span className="font-medium">Holds personal data</span>
          ) : (
            <span className="text-muted">No</span>
          ),
      },
      {
        id: 'grants',
        header: 'Access grants',
        meta: { label: 'Access grants', align: 'right', sortKey: 'grantCount' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.grantCount}</span>,
      },
    ],
    [org, classLabel],
  )
}

export function SystemListPage() {
  const org = useOrgSlug()
  const can = useCan()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useSystems(org, query)
  const columns = useColumns(org)
  const classLabel = useClassificationLabel()
  const newButton = can('security.edit') ? (
    <Button asChild variant="primary">
      <Link href={securityPaths.systemNew(org)}>
        <PlusIcon aria-hidden="true" /> New system
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Systems"
        breadcrumbs={securityCrumbs({ label: 'Systems' })}
        description="Servers, cloud accounts, repositories, domains and applications the organisation relies on, and who owns each."
        actions={newButton}
      />
      <DataTable
        label="Systems"
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
        getRowId={(s) => s.id}
        searchPlaceholder="Search by ID, name or provider"
        filters={
          <>
            <FacetFilter
              label="Type"
              options={Object.entries(SYSTEM_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={params.filters.type ?? []}
              onChange={(v) => setParams({ filters: { type: v } })}
            />
            <FacetFilter
              label="Classification"
              options={(['public', 'internal', 'confidential', 'restricted'] as const).map((c) => ({
                value: c,
                label: classLabel(c),
              }))}
              selected={params.filters.classification ?? []}
              onChange={(v) => setParams({ filters: { classification: v } })}
            />
            <FacetFilter
              label="Personal data"
              options={[
                { value: 'true', label: 'Holds personal data' },
                { value: 'false', label: 'No personal data' },
              ]}
              selected={params.filters.personalData ?? []}
              onChange={(v) => setParams({ filters: { personalData: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={ServerIcon}
            title="No systems yet"
            body="List the servers, accounts and applications you run. Access grants, secrets, changes and decisions attach to them."
            actions={newButton}
          />
        }
      />
    </div>
  )
}
