'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, ShieldCheckIcon, TableIcon } from 'lucide-react'
import { useControls } from '@/lib/api/hooks/use-evidence'
import { useDocumentLookup } from '@/lib/api/hooks/use-documents'
import { useAiStats } from '@/lib/api/hooks/use-ai'
import type { AiStats, AiTotals } from '@/lib/api/types'
import { hasFeature } from '@/lib/entitlements'
import { addDaysToDate } from '@/lib/privacy'
import { formatNumber, formatPercent, formatPhp } from '@/lib/utils/format'
import { todayInTz } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import { useSession } from '@/components/providers/session-provider'
import { DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { ErrorState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarList,
  compact,
  shortDate,
  TimeSeriesChart,
  type Point,
} from '@/features/ai-governance/charts'
import { aiCrumbs, aiPaths } from '@/features/ai-governance/shared'
import { policyPaths } from '@/features/policies/paths'
import { evidencePaths } from '@/features/evidence/shared'

const RANGES = [
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
] as const

const cacheRate = (t: Pick<AiTotals, 'calls' | 'cacheHits'>) =>
  t.calls ? t.cacheHits / t.calls : 0

interface Metric {
  key: string
  title: string
  total: (t: AiTotals) => number
  /** Per-day value. */
  day: (d: AiStats['days'][number]) => number
  format: (n: number) => string
  tick?: (n: number) => string
  /** A ratio, so the period "total" is the overall rate. */
  note?: string
}

const METRICS: Metric[] = [
  {
    key: 'calls',
    title: 'Calls',
    total: (t) => t.calls,
    day: (d) => d.calls,
    format: formatNumber,
  },
  {
    key: 'piiMasked',
    title: 'PII masked',
    total: (t) => t.piiMasked,
    day: (d) => d.piiMasked,
    format: formatNumber,
    note: 'Prompts where something personal was replaced before it left.',
  },
  {
    key: 'blocked',
    title: 'Blocked',
    total: (t) => t.blocked,
    day: (d) => d.blocked,
    format: formatNumber,
    note: 'Prompts stopped by a guardrail or a blocked topic.',
  },
  {
    key: 'cache',
    title: 'Cache hit rate',
    total: cacheRate,
    day: (d) => cacheRate(d),
    format: (n) => formatPercent(n, 1),
    tick: (n) => formatPercent(n),
    note: 'Calls answered from the cache instead of the provider.',
  },
  {
    key: 'cost',
    title: 'Estimated cost',
    total: (t) => t.costEstimatePhp,
    day: (d) => d.costEstimatePhp,
    format: formatPhp,
    tick: (n) => `₱${compact(n)}`,
    note: 'What the providers will bill, before any discounts.',
  },
]

function Delta({ now, before }: { now: number; before: number | null }) {
  if (before === null || before === 0)
    return <span className="text-sm text-muted">No earlier period to compare</span>
  const change = (now - before) / before
  const Icon = change >= 0 ? ArrowUpIcon : ArrowDownIcon
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted">
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="tabular-nums">{formatPercent(Math.abs(change), 1)}</span>{' '}
      {change >= 0 ? 'more' : 'fewer'} than the period before
    </span>
  )
}

function StatTile({ metric, stats }: { metric: Metric; stats: AiStats }) {
  const value = metric.total(stats.totals)
  const before = stats.previous ? metric.total(stats.previous) : null
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-4 py-3"
      data-testid={`tile-${metric.key}`}
    >
      <span className="label-caps">{metric.title}</span>
      <span className="text-2xl font-semibold" data-testid={`tile-${metric.key}-value`}>
        {metric.format(value)}
      </span>
      {metric.key === 'cache' ? (
        <span className="text-sm text-muted">
          {formatNumber(stats.totals.cacheHits)} of {formatNumber(stats.totals.calls)} calls
        </span>
      ) : (
        <Delta now={value} before={before} />
      )}
    </div>
  )
}

function ProxyStatus({ stats }: { stats: AiStats }) {
  return (
    <Card data-testid="proxy-status" data-status={stats.status}>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <ShieldCheckIcon className="size-5 text-accent" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 font-medium">
              VisorShield proxy <StatusPill status={stats.status} />
            </span>
            <span className="text-sm text-muted">{stats.statusNote}</span>
          </div>
        </div>
        <dl className="ml-auto flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="label-caps">p95 latency</dt>
            <dd className="tabular-nums">{formatNumber(stats.latencyP95Ms)} ms</dd>
          </div>
          <div>
            <dt className="label-caps">Uptime, 30 days</dt>
            <dd className="tabular-nums">{stats.uptimePct}%</dd>
          </div>
          <div>
            <dt className="label-caps">Checked</dt>
            <dd>
              <DateText value={stats.checkedAt} relative />
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}

/** What these numbers support: the AI policy and the controls an auditor will ask about. */
function EvidenceFeeds() {
  const { org, tier } = useSession()
  const policies = hasFeature(tier, 'policies')
  const controls = hasFeature(tier, 'evidence')
  const docs = useDocumentLookup(org.slug, policies)
  const list = useControls(org.slug, { pageSize: 200 }, controls)
  const policy = docs.data?.find((d) => d.docId === 'ITD-015')
  const feeds = (list.data?.items ?? []).filter((c) => ['A.5.23', 'A.8.15'].includes(c.reference))
  if (!policy && !feeds.length) return null
  return (
    <Card data-testid="evidence-feeds">
      <CardHeader>
        <div>
          <CardTitle>Where these numbers count</CardTitle>
          <CardDescription>
            An auditor asks for proof that AI use is controlled. These statistics support:
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {policy ? (
            <li>
              <Link
                href={policyPaths.view(org.slug, policy.id)}
                className="font-medium text-accent hover:underline"
              >
                {policy.docId} {policy.title}
              </Link>
            </li>
          ) : null}
          {feeds.map((c) => (
            <li key={c.id}>
              <Link
                href={evidencePaths.control(org.slug, c.id)}
                className="font-medium text-accent hover:underline"
              >
                {c.reference} {c.title}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function DataTableView({ stats }: { stats: AiStats }) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Daily statistics, scrollable"
      className="max-h-96 overflow-auto rounded-lg border border-line bg-surface"
    >
      <table
        className="w-full min-w-[560px] border-collapse text-base tabular-nums"
        aria-label="Daily proxy statistics"
      >
        <thead className="sticky top-0 bg-surface-2 text-left">
          <tr>
            {['Date', 'Calls', 'PII masked', 'Blocked', 'Cache hit rate', 'Estimated cost'].map(
              (h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={cn(
                    'h-9 border-b border-line px-3 text-xs font-semibold text-muted',
                    i > 0 && 'text-right',
                  )}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {[...stats.days].reverse().map((d) => (
            <tr key={d.date} className="border-b border-line last:border-b-0">
              <th scope="row" className="px-3 py-1.5 text-left font-normal">
                {shortDate(d.date)}
              </th>
              <td className="px-3 py-1.5 text-right">{formatNumber(d.calls)}</td>
              <td className="px-3 py-1.5 text-right">{formatNumber(d.piiMasked)}</td>
              <td className="px-3 py-1.5 text-right">{formatNumber(d.blocked)}</td>
              <td className="px-3 py-1.5 text-right">{formatPercent(cacheRate(d), 1)}</td>
              <td className="px-3 py-1.5 text-right">{formatPhp(d.costEstimatePhp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AiOverviewPage() {
  const { org } = useSession()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const range = RANGES.find((r) => r.key === params.get('range')) ?? RANGES[0]
  const today = todayInTz(org.timezone)
  const query = useMemo(
    () => ({ from: addDaysToDate(today, -(range.days - 1)), to: today }),
    [today, range.days],
  )
  const stats = useAiStats(org.slug, query)
  const [asTable, setAsTable] = useState(false)

  const setRange = (key: string) => {
    const next = new URLSearchParams(params.toString())
    if (key === RANGES[0].key) next.delete('range')
    else next.set('range', key)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const data = stats.data
  const series = (m: Metric): Point[] =>
    (data?.days ?? []).map((d) => ({ date: d.date, value: m.day(d) }))
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="AI Governance"
        breadcrumbs={aiCrumbs(null)}
        description="What VisorShield saw and stopped on the way to AI providers, and the use cases, assessments and settings behind it."
        className="pb-0"
        actions={
          <Button asChild variant="secondary">
            <Link href={aiPaths.events(org.slug)}>View events</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Period"
          className="inline-flex rounded-md border border-line bg-surface p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={range.key === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                'h-7 rounded-sm px-3 text-sm font-medium',
                range.key === r.key ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
        >
          <TableIcon aria-hidden="true" /> {asTable ? 'Show charts' : 'View as table'}
        </Button>
      </div>

      {stats.isLoading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-20" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {METRICS.map((m) => (
              <Skeleton key={m.key} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : stats.isError || !data ? (
        <ErrorState title="Couldn’t load proxy statistics" onRetry={() => void stats.refetch()} />
      ) : (
        <>
          <ProxyStatus stats={data} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {METRICS.map((m) => (
              <StatTile key={m.key} metric={m} stats={data} />
            ))}
          </div>

          {asTable ? (
            <DataTableView stats={data} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {METRICS.map((m) => (
                <Card key={m.key}>
                  <CardHeader>
                    <div>
                      <CardTitle>{m.title}</CardTitle>
                      {m.note ? <CardDescription>{m.note}</CardDescription> : null}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <TimeSeriesChart
                      title={m.title}
                      points={series(m)}
                      formatValue={m.format}
                      formatTick={m.tick}
                      isFetching={stats.isFetching}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card data-testid="top-blocked">
              <CardHeader>
                <div>
                  <CardTitle>Top blocked reasons</CardTitle>
                  <CardDescription>Why prompts were stopped in this period.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.topBlocked.length ? (
                  <BarList
                    label="Top blocked reasons"
                    items={data.topBlocked.map((b) => ({ label: b.reason, value: b.count }))}
                  />
                ) : (
                  <p className="text-base text-muted">Nothing was blocked in this period.</p>
                )}
              </CardContent>
            </Card>
            <EvidenceFeeds />
          </div>
        </>
      )}
    </div>
  )
}
