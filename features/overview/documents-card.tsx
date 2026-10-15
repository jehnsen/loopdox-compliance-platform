import Link from 'next/link'
import type { DocumentCounts } from '@/lib/api/types'
import { policyPaths } from '@/features/policies/paths'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarLegend, StackedBar, type BarSegment } from '@/features/overview/stacked-bar'

export function documentSegments(d: DocumentCounts): BarSegment[] {
  return [
    { key: 'approved', label: 'Approved', value: d.approved, className: 'bg-ok' },
    { key: 'in_review', label: 'In review', value: d.in_review, className: 'bg-warn' },
    { key: 'draft', label: 'Draft', value: d.draft, className: 'bg-muted' },
    { key: 'retired', label: 'Retired', value: d.retired, className: 'bg-line' },
  ]
}

/** Controlled documents: approved of total, split by status. */
export function DocumentsCard({ org, counts }: { org: string; counts: DocumentCounts }) {
  const segments = documentSegments(counts)
  return (
    <Card data-testid="documents-card">
      <CardHeader>
        <div>
          <CardTitle>Controlled documents</CardTitle>
          <CardDescription>Policies and procedures by status.</CardDescription>
        </div>
        <Link href={policyPaths.library(org)} className="text-sm text-accent hover:underline">
          Open library
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tabular-nums" data-testid="documents-approved">
            {counts.approved}
          </span>
          <span className="text-base text-muted">
            of <span data-testid="documents-total">{counts.total}</span> approved
          </span>
        </p>
        <StackedBar
          segments={segments}
          label={`${counts.approved} of ${counts.total} controlled documents approved`}
        />
        <BarLegend segments={segments} />
      </CardContent>
    </Card>
  )
}
