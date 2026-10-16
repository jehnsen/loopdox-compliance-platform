'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { FlameIcon, PlusIcon } from 'lucide-react'
import { useRisks } from '@/lib/api/hooks/use-security'
import type { RiskSummary, Score } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { BAND_LABELS } from '@/lib/risk'
import { TREATMENT_LABELS } from '@/lib/security'
import { cn } from '@/lib/utils/cn'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { DataTable } from '@/components/data-table/data-table'
import { FacetFilter } from '@/components/data-table/facet-filter'
import { CalendarDate } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { RiskMatrix, ScoreBadge } from '@/components/risk-matrix'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { securityPaths } from '@/features/security/paths'
import { DuePill, securityCrumbs } from '@/features/security/shared'

const FILTER_KEYS = ['status', 'treatment', 'band', 'review', 'cell'] as const
type Basis = 'inherent' | 'residual'

function parseCell(v: string | undefined): { likelihood: Score; impact: Score } | null {
  const m = /^([1-5])x([1-5])$/.exec(v ?? '')
  return m ? { likelihood: Number(m[1]) as Score, impact: Number(m[2]) as Score } : null
}

function useColumns(org: string): ColumnDef<RiskSummary>[] {
  return useMemo(
    () => [
      {
        id: 'ref',
        header: 'ID',
        meta: { label: 'ID', sortKey: 'ref', alwaysVisible: true, className: 'w-28' },
        cell: ({ row }) => <IdChip>{row.original.ref}</IdChip>,
      },
      {
        id: 'title',
        header: 'Risk',
        meta: { label: 'Risk', sortKey: 'title', alwaysVisible: true, className: 'min-w-64' },
        cell: ({ row }) => (
          <Link
            href={securityPaths.riskView(org, row.original.id)}
            className="font-medium hover:text-accent hover:underline"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'inherent',
        header: 'Inherent',
        meta: { label: 'Inherent', sortKey: 'inherentScore' },
        cell: ({ row }) => <ScoreBadge score={row.original.inherentScore} />,
      },
      {
        id: 'residual',
        header: 'Residual',
        meta: { label: 'Residual', sortKey: 'residualScore' },
        cell: ({ row }) =>
          row.original.residualScore === null ? (
            <span className="text-sm text-muted">Not assessed</span>
          ) : (
            <ScoreBadge score={row.original.residualScore} />
          ),
      },
      {
        id: 'treatment',
        header: 'Treatment',
        meta: { label: 'Treatment', sortKey: 'treatment' },
        cell: ({ row }) => TREATMENT_LABELS[row.original.treatment],
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner', sortKey: 'ownerName' },
        cell: ({ row }) => row.original.ownerName,
      },
      {
        id: 'reviewAt',
        header: 'Review',
        meta: { label: 'Review', sortKey: 'reviewAt' },
        cell: ({ row }) =>
          row.original.status === 'closed' ? (
            <span className="text-muted">—</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
              <CalendarDate value={row.original.reviewAt} />
              <DuePill
                state={row.original.reviewState}
                days={row.original.daysToReview}
                verb="Review"
              />
            </span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status', sortKey: 'status' },
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
    ],
    [org],
  )
}

export function RiskListPage() {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const basis: Basis = search.get('basis') === 'residual' ? 'residual' : 'inherent'
  const { params, setParams, query } = useListParams({ filterKeys: FILTER_KEYS })
  const list = useRisks(org, { ...query, basis })
  // The heat map counts every open risk, whatever the table is filtered to.
  const open = useRisks(org, { pageSize: 200, status: ['open'] })
  const columns = useColumns(org)
  const selected = parseCell(params.filters.cell?.[0])

  const points = useMemo(
    () =>
      (open.data?.items ?? []).flatMap((r) => {
        if (basis === 'inherent') return [{ likelihood: r.likelihood, impact: r.impact }]
        return r.residualLikelihood !== null && r.residualImpact !== null
          ? [{ likelihood: r.residualLikelihood, impact: r.residualImpact }]
          : []
      }),
    [open.data, basis],
  )
  const unassessed = basis === 'residual' ? (open.data?.items.length ?? 0) - points.length : 0

  const setBasis = (b: Basis) => {
    const next = new URLSearchParams(search.toString())
    if (b === 'residual') next.set('basis', 'residual')
    else next.delete('basis')
    next.delete('page')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const newButton = can('security.edit') ? (
    <Button asChild variant="primary">
      <Link href={securityPaths.riskNew(org)}>
        <PlusIcon aria-hidden="true" /> New risk
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Risks"
        breadcrumbs={securityCrumbs({ label: 'Risks' })}
        description="The risk register. Rate each risk by likelihood and impact, say how it is treated, and review it on a schedule."
        actions={newButton}
        className="pb-0"
      />
      <Card>
        <CardHeader className="flex-wrap items-center">
          <CardTitle className="text-base">Heat map</CardTitle>
          <div
            role="group"
            aria-label="Rating shown"
            className="flex rounded-md border border-line p-0.5"
          >
            {(['inherent', 'residual'] as const).map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={basis === b}
                onClick={() => setBasis(b)}
                className={cn(
                  'h-7 rounded-sm px-3 text-sm capitalize',
                  basis === b
                    ? 'bg-accent-soft font-medium text-accent'
                    : 'text-muted hover:text-fg',
                )}
              >
                {b}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <RiskMatrix
            risks={points}
            caption={`Open risks by ${basis} likelihood and impact`}
            selected={selected}
            onSelect={(cell) =>
              setParams({ filters: { cell: cell ? [`${cell.likelihood}x${cell.impact}`] : [] } })
            }
          />
          <p className="text-sm text-muted">
            {selected
              ? `Showing risks rated likelihood ${selected.likelihood}, impact ${selected.impact} (${basis}). Select the cell again to clear it.`
              : 'Select a cell to list the risks in it.'}
            {unassessed
              ? ` ${unassessed} open ${unassessed === 1 ? 'risk has' : 'risks have'} no residual rating yet.`
              : ''}
          </p>
        </CardContent>
      </Card>
      <DataTable
        label="Risks"
        columns={columns}
        data={list.data}
        isLoading={list.isLoading}
        isFetching={list.isFetching}
        isError={list.isError}
        error={list.error}
        onRetry={() => void list.refetch()}
        params={params}
        setParams={setParams}
        query={{ ...query, basis }}
        getRowId={(r) => r.id}
        rowHref={(r) => securityPaths.riskView(org, r.id)}
        searchPlaceholder="Search by ID, title or owner"
        rowClassName={(r) => (r.reviewState === 'overdue' ? 'bg-bad-soft/50' : undefined)}
        filters={
          <>
            <FacetFilter
              label="Status"
              options={[
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
              ]}
              selected={params.filters.status ?? []}
              onChange={(v) => setParams({ filters: { status: v } })}
            />
            <FacetFilter
              label="Treatment"
              options={Object.entries(TREATMENT_LABELS).map(([value, label]) => ({ value, label }))}
              selected={params.filters.treatment ?? []}
              onChange={(v) => setParams({ filters: { treatment: v } })}
            />
            <FacetFilter
              label={`Band (${basis})`}
              options={(['critical', 'high', 'medium', 'low'] as const).map((b) => ({
                value: b,
                label: BAND_LABELS[b],
              }))}
              selected={params.filters.band ?? []}
              onChange={(v) => setParams({ filters: { band: v } })}
            />
            <FacetFilter
              label="Review"
              options={[
                { value: 'overdue', label: 'Overdue' },
                { value: 'due_soon', label: 'Due within 30 days' },
              ]}
              selected={params.filters.review ?? []}
              onChange={(v) => setParams({ filters: { review: v } })}
            />
          </>
        }
        emptyState={
          <EmptyState
            icon={FlameIcon}
            title="No risks yet"
            body="Add the risks that matter, rate them, and link the policies and controls that treat them."
            actions={newButton}
          />
        }
      />
    </div>
  )
}
