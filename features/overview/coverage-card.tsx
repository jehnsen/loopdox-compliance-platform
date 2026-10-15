import type { ControlCoverage } from '@/lib/api/types'
import { FRAMEWORK_LABELS } from '@/lib/overview'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarLegend, StackedBar, type BarSegment } from '@/features/overview/stacked-bar'

const LEGEND: BarSegment[] = [
  { key: 'passing', label: 'Passing', value: 0, className: 'bg-ok' },
  { key: 'failing', label: 'Failing', value: 0, className: 'bg-bad' },
  { key: 'no_evidence', label: 'No evidence', value: 0, className: 'bg-warn' },
]

function segmentsOf(c: ControlCoverage): BarSegment[] {
  return LEGEND.map((s) => ({ ...s, value: c[s.key as 'passing' | 'failing' | 'no_evidence'] }))
}

/** Control coverage by framework: passing, failing and no evidence (Pro and above). */
export function CoverageCard({ coverage }: { coverage: ControlCoverage[] }) {
  const totals = LEGEND.map((s) => ({
    ...s,
    value: coverage.reduce((n, c) => n + c[s.key as 'passing' | 'failing' | 'no_evidence'], 0),
  }))
  return (
    <Card data-testid="coverage-card">
      <CardHeader>
        <div>
          <CardTitle>Control coverage</CardTitle>
          <CardDescription>Controls with passing evidence, by framework.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {coverage.length ? (
          <ul className="flex flex-col gap-3">
            {coverage.map((c) => (
              <li key={c.framework} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{FRAMEWORK_LABELS[c.framework]}</span>
                  <span className="text-muted tabular-nums">
                    {c.passing} of {c.total} passing
                  </span>
                </div>
                <StackedBar
                  segments={segmentsOf(c)}
                  label={`${FRAMEWORK_LABELS[c.framework]}: ${c.passing} passing, ${c.failing} failing, ${c.no_evidence} with no evidence, of ${c.total} controls`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-muted">No controls are set up yet.</p>
        )}
        <BarLegend segments={totals} />
      </CardContent>
    </Card>
  )
}
