import {
  BellRingIcon,
  BotIcon,
  FileCheck2Icon,
  ShieldCheckIcon,
  type LucideIcon,
} from 'lucide-react'
import type { OverviewResponse } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { formatNumber } from '@/lib/utils/format'

type Tone = 'ok' | 'warn' | 'bad' | 'info'

const TONES: Record<Tone, { icon: string; bar: string }> = {
  ok: { icon: 'bg-ok-soft text-ok ring-ok/15', bar: 'bg-ok' },
  warn: { icon: 'bg-warn-soft text-warn ring-warn/15', bar: 'bg-warn' },
  bad: { icon: 'bg-bad-soft text-bad ring-bad/15', bar: 'bg-bad' },
  info: { icon: 'bg-accent-soft text-accent ring-accent/15', bar: 'bg-accent' },
}

interface Kpi {
  id: string
  label: string
  icon: LucideIcon
  value: string
  detail: string
  tone: Tone
  /** 0–100; draws a thin meter under the value. */
  pct?: number
}

function pctOf(n: number, total: number): number {
  return total ? Math.round((n / total) * 100) : 0
}

function coverageTone(pct: number): Tone {
  if (pct >= 80) return 'ok'
  if (pct >= 50) return 'warn'
  return 'bad'
}

function kpisOf(data: OverviewResponse, operational: boolean): Kpi[] {
  const out: Kpi[] = []
  if (operational) {
    const urgent = data.attention.items.filter((i) => i.tone === 'bad').length
    const total = data.attention.total
    out.push({
      id: 'attention',
      label: 'Open items',
      icon: BellRingIcon,
      value: formatNumber(total),
      detail: total ? (urgent ? `${urgent} urgent` : 'None urgent') : 'All caught up',
      tone: urgent ? 'bad' : total ? 'warn' : 'ok',
    })
  }
  if (data.documents) {
    const { approved, total } = data.documents
    const pct = pctOf(approved, total)
    out.push({
      id: 'documents',
      label: 'Policies approved',
      icon: FileCheck2Icon,
      value: `${pct}%`,
      detail: `${approved} of ${total} documents`,
      tone: coverageTone(pct),
      pct,
    })
  }
  if (data.controlCoverage?.length) {
    const passing = data.controlCoverage.reduce((n, c) => n + c.passing, 0)
    const total = data.controlCoverage.reduce((n, c) => n + c.total, 0)
    const pct = pctOf(passing, total)
    out.push({
      id: 'controls',
      label: 'Controls passing',
      icon: ShieldCheckIcon,
      value: `${pct}%`,
      detail: `${passing} of ${total} controls`,
      tone: coverageTone(pct),
      pct,
    })
  }
  if (data.ai) {
    out.push({
      id: 'ai',
      label: 'AI calls governed',
      icon: BotIcon,
      value: formatNumber(data.ai.calls),
      detail: `${formatNumber(data.ai.blocked)} blocked · ${formatNumber(data.ai.piiMasked)} masked`,
      tone: 'info',
    })
  }
  return out
}

/** Headline posture: one number per area, with the detail that backs it. */
export function PostureStrip({
  data,
  operational,
}: {
  data: OverviewResponse
  operational: boolean
}) {
  const kpis = kpisOf(data, operational)
  if (kpis.length < 2) return null
  return (
    <section aria-labelledby="posture" className="flex flex-col gap-3">
      <h2 id="posture" className="sr-only">
        Compliance posture
      </h2>
      <ul
        className={cn(
          'grid gap-3 sm:grid-cols-2',
          kpis.length === 3 && 'lg:grid-cols-3',
          kpis.length >= 4 && 'xl:grid-cols-4',
        )}
      >
        {kpis.map((k) => (
          <li
            key={k.id}
            data-testid={`posture-${k.id}`}
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="label-caps">{k.label}</span>
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-7 items-center justify-center rounded-md ring-1 ring-inset',
                  TONES[k.tone].icon,
                )}
              >
                <k.icon className="size-4" />
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">{k.value}</span>
              <span className="text-sm text-muted">{k.detail}</span>
            </div>
            {k.pct !== undefined ? (
              <span
                aria-hidden="true"
                className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
              >
                <span
                  className={cn('block h-full rounded-full', TONES[k.tone].bar)}
                  style={{ width: `${k.pct}%` }}
                />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
