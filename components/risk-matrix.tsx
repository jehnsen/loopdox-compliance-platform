import type { Score } from '@/lib/api/types'
import {
  BAND_LABELS,
  IMPACT_LABELS,
  LIKELIHOOD_LABELS,
  riskScore,
  SCORES,
  scoreBand,
  type ScoreBand,
} from '@/lib/risk'
import { cn } from '@/lib/utils/cn'

export const BAND_CLASSES: Record<ScoreBand, string> = {
  low: 'bg-ok-soft text-ok',
  medium: 'bg-warn-soft text-warn',
  high: 'bg-bad-soft text-bad',
  critical: 'bg-bad text-surface',
}

/** "12 · High" with the band colour; reads without colour too. */
export function ScoreBadge({ score, className }: { score: number | null; className?: string }) {
  if (score === null) return <span className={cn('text-muted', className)}>—</span>
  const band = scoreBand(score)
  return (
    <span
      data-band={band}
      className={cn(
        'inline-flex h-5.5 items-center gap-1 rounded-sm px-1.5 text-xs font-semibold tabular-nums',
        BAND_CLASSES[band],
        className,
      )}
    >
      {score} · {BAND_LABELS[band]}
    </span>
  )
}

/**
 * 5×5 likelihood × impact matrix with the number of risks in each cell.
 * A table, so screen readers get row and column headers for every cell.
 */
export function RiskMatrix({
  risks,
  caption = 'Risks by likelihood and impact',
  className,
}: {
  risks: readonly { likelihood: Score; impact: Score }[]
  caption?: string
  className?: string
}) {
  const count = (l: Score, i: Score) =>
    risks.filter((r) => r.likelihood === l && r.impact === i).length
  const impacts = [...SCORES].reverse()
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="border-separate border-spacing-1 text-xs" data-testid="risk-matrix">
        <caption className="mb-1 text-left text-sm font-medium">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-20 text-left font-normal text-muted">
              <span className="sr-only">Impact, then likelihood</span>
            </th>
            {SCORES.map((l) => (
              <th
                key={l}
                scope="col"
                className="w-12 px-0.5 text-center font-normal text-muted"
                title={LIKELIHOOD_LABELS[l]}
              >
                L{l}
                <span className="sr-only"> {LIKELIHOOD_LABELS[l]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {impacts.map((i) => (
            <tr key={i}>
              <th scope="row" className="pr-1 text-left font-normal whitespace-nowrap text-muted">
                I{i} <span className="hidden sm:inline">{IMPACT_LABELS[i]}</span>
              </th>
              {SCORES.map((l) => {
                const score = riskScore(l, i)
                const n = count(l, i)
                return (
                  <td
                    key={l}
                    title={`Likelihood ${l} × impact ${i} = ${score} (${BAND_LABELS[scoreBand(score)]}): ${n} ${n === 1 ? 'risk' : 'risks'}`}
                    className={cn(
                      'h-9 w-12 rounded-sm text-center font-semibold tabular-nums',
                      n ? BAND_CLASSES[scoreBand(score)] : 'bg-surface-2 text-muted/70',
                    )}
                  >
                    {n ? n : <span aria-label="none">·</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted">
        Score = likelihood × impact. Low 1–4 · Medium 5–9 · High 10–16 · Critical 20–25.
      </p>
    </div>
  )
}
