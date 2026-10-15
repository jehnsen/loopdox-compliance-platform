'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ChevronRightIcon, DownloadIcon, FileCheck2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { isApiError } from '@/lib/api/client'
import { exportAuditPack, useAuditPack } from '@/lib/api/hooks/use-evidence'
import type { AuditPackControl, Framework } from '@/lib/api/types'
import {
  DEFAULT_PERIOD,
  FRAMEWORK_ORDER,
  periodRange,
  PERIOD_LABELS,
  SOURCE_LABELS,
  type PeriodKey,
} from '@/lib/evidence'
import { FRAMEWORK_LABELS } from '@/lib/overview'
import { cn } from '@/lib/utils/cn'
import { formatCalendarDate, todayInTz } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { IdChip, VersionChip } from '@/components/chips'
import { DateText } from '@/components/date-text'
import { FileLink } from '@/components/file-dropzone'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { evidenceCrumbs, evidencePaths, ResultPill } from '@/features/evidence/shared'

const PERIOD_KEYS = Object.keys(PERIOD_LABELS) as PeriodKey[]

/** The period lives in the URL (`?period=90d`, or `?period=custom&from=…&to=…`), so a view can be shared. */
function usePeriod() {
  const { org } = useSession()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const today = todayInTz(org.timezone)
  const raw = params.get('period')
  const key: PeriodKey = PERIOD_KEYS.includes(raw as PeriodKey)
    ? (raw as PeriodKey)
    : DEFAULT_PERIOD
  const from = key === 'custom' ? (params.get('from') ?? '') : ''
  const to = key === 'custom' ? (params.get('to') ?? '') : ''

  const range = key === 'custom' ? { from: from || null, to: to || null } : periodRange(key, today)
  const invalid = key === 'custom' && Boolean(from && to && from > to)

  const set = (patch: { period?: PeriodKey; from?: string; to?: string }) => {
    const next = new URLSearchParams(params.toString())
    const period = patch.period ?? key
    if (period === DEFAULT_PERIOD) next.delete('period')
    else next.set('period', period)
    const f = patch.from ?? from
    const t = patch.to ?? to
    if (period === 'custom' && f) next.set('from', f)
    else next.delete('from')
    if (period === 'custom' && t) next.set('to', t)
    else next.delete('to')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  return { key, from, to, range, invalid, today, set }
}

function describePeriod(range: { from: string | null; to: string | null }): string {
  if (!range.from && !range.to) return 'All evidence on record'
  if (range.from && range.to) {
    return `${formatCalendarDate(range.from)} to ${formatCalendarDate(range.to)}`
  }
  return range.from
    ? `From ${formatCalendarDate(range.from)}`
    : `Up to ${formatCalendarDate(range.to ?? '')}`
}

function Total({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'bad' | 'warn'
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="label-caps">{label}</dt>
      <dd
        className={cn(
          'text-xl font-semibold tabular-nums',
          tone === 'ok' && 'text-ok',
          tone === 'bad' && 'text-bad',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function PackControl({
  item,
  org,
  open,
  onToggle,
}: {
  item: AuditPackControl
  org: string
  open: boolean
  onToggle: () => void
}) {
  const { control, policies, evidence } = item
  const panelId = `pack-${control.id}`
  return (
    <li className="border-b border-line last:border-b-0" data-testid="pack-control">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-surface-2/60"
        >
          <ChevronRightIcon
            className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-90')}
            aria-hidden="true"
          />
          <IdChip>{control.reference}</IdChip>
          <span className="min-w-0 flex-1 font-medium">{control.title}</span>
          <span className="text-sm text-muted">
            {policies.length} {policies.length === 1 ? 'policy' : 'policies'} · {evidence.length}{' '}
            evidence {evidence.length === 1 ? 'item' : 'items'}
          </span>
          <StatusPill status={item.periodStatus} />
        </button>
      </h3>
      {open ? (
        <div id={panelId} className="grid gap-5 px-4 pt-1 pb-4 md:grid-cols-2 md:pl-11">
          <section aria-label={`Approved policies for ${control.reference}`}>
            <h4 className="label-caps mb-2">Approved policy</h4>
            {policies.length ? (
              <ul className="flex flex-col gap-2.5">
                {policies.map((p) => (
                  <li key={p.id} className="flex flex-col gap-0.5" data-testid="pack-policy">
                    <span className="flex flex-wrap items-center gap-2">
                      <IdChip>{p.docId}</IdChip>
                      <VersionChip version={p.version} />
                      <Link href={p.href} className="font-medium hover:text-accent hover:underline">
                        {p.title}
                      </Link>
                    </span>
                    <span className="text-sm text-muted">
                      Approved <DateText value={p.approvedAt} />
                      {p.approvedByName ? ` by ${p.approvedByName}` : ''}
                      {p.effectiveDate
                        ? ` · in force from ${formatCalendarDate(p.effectiveDate)}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base text-muted">No approved policy is linked to this control.</p>
            )}
          </section>
          <section aria-label={`Evidence for ${control.reference}`}>
            <h4 className="label-caps mb-2">Evidence in this period</h4>
            {evidence.length ? (
              <ul className="flex flex-col gap-3">
                {evidence.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1" data-testid="pack-evidence">
                    <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      <DateText value={e.collectedAt} className="font-medium text-fg" />
                      <span>
                        {SOURCE_LABELS[e.source]}
                        {e.connectorName ? ` · ${e.connectorName}` : ''}
                      </span>
                      <ResultPill result={e.result} />
                    </span>
                    <span>{e.summary}</span>
                    {e.file ? <FileLink file={e.file} className="text-sm" /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base text-muted">No evidence was collected in this period.</p>
            )}
            <Link
              href={evidencePaths.control(org, control.id)}
              className="mt-3 inline-block text-sm text-accent hover:underline"
            >
              Open {control.reference} for its full timeline
            </Link>
          </section>
        </div>
      ) : null}
    </li>
  )
}

/**
 * Controls → approved policy → evidence, for a period. Read-only: it holds no edit
 * controls, and the server leaves drafts and unapproved policies out of it.
 */
export function AuditPackPage() {
  const { org } = useSession()
  const period = usePeriod()
  const pack = useAuditPack(org.slug, period.invalid ? { from: null, to: null } : period.range)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [exporting, setExporting] = useState(false)

  const byFramework = useMemo(() => {
    const groups = new Map<Framework, AuditPackControl[]>()
    for (const c of pack.data?.controls ?? []) {
      groups.set(c.control.framework, [...(groups.get(c.control.framework) ?? []), c])
    }
    return FRAMEWORK_ORDER.flatMap((f) =>
      groups.has(f) ? [{ framework: f, items: groups.get(f) ?? [] }] : [],
    )
  }, [pack.data])

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const allIds = (pack.data?.controls ?? []).map((c) => c.control.id)

  const runExport = async () => {
    setExporting(true)
    try {
      await exportAuditPack(org.slug, period.range)
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'The export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  const data = pack.data
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Audit pack"
        breadcrumbs={evidenceCrumbs({ label: 'Audit pack' })}
        description="Each control, the approved policy that answers it, and the evidence collected in the period. Drafts and policies awaiting approval are left out."
        actions={
          <Button
            variant="primary"
            onClick={() => void runExport()}
            disabled={exporting || period.invalid || !data}
          >
            <DownloadIcon aria-hidden="true" />
            {exporting ? 'Exporting…' : 'Export pack'}
          </Button>
        }
        className="pb-0"
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pack-period">Period</Label>
          <Select value={period.key} onValueChange={(v) => period.set({ period: v as PeriodKey })}>
            <SelectTrigger id="pack-period" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {PERIOD_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {period.key === 'custom' ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="pack-from">From</Label>
              <Input
                id="pack-from"
                type="date"
                value={period.from}
                max={period.to || period.today}
                onChange={(e) => period.set({ from: e.target.value })}
                className="w-full sm:w-44"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pack-to">To</Label>
              <Input
                id="pack-to"
                type="date"
                value={period.to}
                min={period.from || undefined}
                onChange={(e) => period.set({ to: e.target.value })}
                className="w-full sm:w-44"
              />
            </div>
          </>
        ) : null}
        <p className="pb-2 text-base text-muted" data-testid="pack-period">
          {describePeriod(period.range)}
        </p>
      </div>
      {period.invalid ? (
        <p role="alert" className="text-sm text-bad">
          The period ends before it starts. Choose a “To” date on or after the “From” date.
        </p>
      ) : null}

      {pack.isLoading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-64" />
        </div>
      ) : pack.isError || !data ? (
        <ErrorState title="Couldn’t load the audit pack" onRetry={() => void pack.refetch()} />
      ) : data.controls.length === 0 ? (
        <EmptyState
          icon={FileCheck2Icon}
          title="No controls to show"
          body="Controls appear here once the organisation’s frameworks are set up."
        />
      ) : (
        <>
          <dl
            className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-surface px-4 py-3 sm:grid-cols-5"
            data-testid="pack-totals"
          >
            <Total label="Controls" value={data.totals.controls} />
            <Total label="Passing" value={data.totals.passing} tone="ok" />
            <Total label="Failing" value={data.totals.failing} tone="bad" />
            <Total label="No evidence" value={data.totals.no_evidence} tone="warn" />
            <Total label="Evidence items" value={data.totals.evidence} />
          </dl>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(new Set(allIds))}>
              Expand all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(new Set())}>
              Collapse all
            </Button>
          </div>

          {byFramework.map(({ framework, items }) => (
            <section
              key={framework}
              aria-labelledby={`pack-${framework}`}
              className="flex flex-col gap-2"
            >
              <h2 id={`pack-${framework}`} className="text-md font-semibold">
                {FRAMEWORK_LABELS[framework]}{' '}
                <span className="text-base font-normal text-muted">
                  · {items.length} {items.length === 1 ? 'control' : 'controls'}
                </span>
              </h2>
              <ul className="rounded-lg border border-line bg-surface">
                {items.map((item) => (
                  <PackControl
                    key={item.control.id}
                    item={item}
                    org={org.slug}
                    open={open.has(item.control.id)}
                    onToggle={() => toggle(item.control.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
          <p className="text-sm text-muted">
            Generated <DateText value={data.generatedAt} withTime />. Exporting the pack is recorded
            in the audit log.
          </p>
        </>
      )}
    </div>
  )
}
