'use client'

import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ActivityIcon, ShieldCheckIcon } from 'lucide-react'
import { useAiEvents, useEventFacets } from '@/lib/api/hooks/use-ai'
import type { AiEvent } from '@/lib/api/types'
import { ACTION_LABELS } from '@/lib/ai'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Input } from '@/components/ui/input'
import { aiCrumbs } from '@/features/ai-governance/shared'

const FILTER_KEYS = ['action', 'app', 'profile', 'user', 'from', 'to'] as const

const columns: ColumnDef<AiEvent>[] = [
  {
    id: 'at',
    header: 'Time',
    meta: { label: 'Time', sortKey: 'at', alwaysVisible: true, className: 'w-40' },
    cell: ({ row }) => <DateText value={row.original.at} withTime className="whitespace-nowrap" />,
  },
  {
    id: 'app',
    header: 'App',
    meta: { label: 'App', sortKey: 'app', className: 'min-w-40' },
    cell: ({ row }) => row.original.app,
  },
  {
    id: 'user',
    header: 'User',
    meta: { label: 'User', sortKey: 'userName' },
    cell: ({ row }) => row.original.userName,
  },
  {
    id: 'action',
    header: 'Action',
    meta: { label: 'Action', sortKey: 'action', alwaysVisible: true },
    cell: ({ row }) => <StatusPill status={row.original.action} />,
  },
  {
    id: 'profile',
    header: 'Profile',
    meta: { label: 'Profile', sortKey: 'profile' },
    cell: ({ row }) => row.original.profile,
  },
  {
    id: 'found',
    header: 'Found',
    meta: { label: 'Found', className: 'min-w-44' },
    cell: ({ row }) => {
      const e = row.original
      if (e.reason) return <span className="text-bad">{e.reason}</span>
      if (!e.entities.length) return <span className="text-muted">Nothing</span>
      return (
        <span className="tabular-nums">
          {e.entities.map((x) => `${x.type} × ${x.count}`).join(', ')}
        </span>
      )
    },
  },
  {
    id: 'sample',
    header: 'Masked sample',
    meta: { label: 'Masked sample', className: 'min-w-80' },
    cell: ({ row }) => (
      <span className="line-clamp-2 font-mono text-sm" data-testid="masked-sample">
        {row.original.maskedSample}
      </span>
    ),
  },
]

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted">
      {label}
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-36"
      />
    </label>
  )
}

export function EventsPage() {
  const org = useOrgSlug()
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useAiEvents(org, query)
  const facets = useEventFacets(org)
  const cols = useMemo(() => columns, [])
  const from = params.filters.from?.[0] ?? ''
  const to = params.filters.to?.[0] ?? ''

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Events"
        breadcrumbs={aiCrumbs({ label: 'Events' })}
        description="What VisorShield did with each prompt: masked, blocked or let through."
      />
      <p
        className="mb-4 flex items-start gap-2 rounded-md border border-line bg-surface px-4 py-3 text-base"
        data-testid="masked-only-notice"
      >
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        Masked samples only. VisorShield replaces what it finds before anything reaches LoopDox, so
        a raw prompt never appears here.
      </p>
      <DataTable
        label="AI events"
        columns={cols}
        data={list.data}
        isLoading={list.isLoading}
        isFetching={list.isFetching}
        isError={list.isError}
        error={list.error}
        onRetry={() => void list.refetch()}
        params={params}
        setParams={setParams}
        query={query}
        getRowId={(e) => e.id}
        searchPlaceholder="Search the masked samples"
        filters={
          <>
            <FacetFilter
              label="Action"
              options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
              selected={params.filters.action ?? []}
              onChange={(v) => setParams({ filters: { action: v } })}
            />
            <FacetFilter
              label="App"
              options={(facets.data?.apps ?? []).map((a) => ({ value: a, label: a }))}
              selected={params.filters.app ?? []}
              onChange={(v) => setParams({ filters: { app: v } })}
            />
            <FacetFilter
              label="User"
              options={(facets.data?.users ?? []).map((u) => ({ value: u.id, label: u.name }))}
              selected={params.filters.user ?? []}
              onChange={(v) => setParams({ filters: { user: v } })}
            />
            <FacetFilter
              label="Profile"
              options={(facets.data?.profiles ?? []).map((p) => ({ value: p, label: p }))}
              selected={params.filters.profile ?? []}
              onChange={(v) => setParams({ filters: { profile: v } })}
            />
            <DateFilter
              label="From"
              value={from}
              onChange={(v) => setParams({ filters: { from: v ? [v] : [] } })}
            />
            <DateFilter
              label="To"
              value={to}
              onChange={(v) => setParams({ filters: { to: v ? [v] : [] } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={ActivityIcon}
            title="No events yet"
            body="Once an app sends a prompt through VisorShield, what it did with it is listed here."
          />
        }
      />
    </div>
  )
}
