import Link from 'next/link'
import { ArrowRightIcon } from 'lucide-react'
import type { AiOverviewTile } from '@/lib/api/types'
import { formatNumber } from '@/lib/utils/format'
import { StatusPill } from '@/components/status-pill'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkline } from '@/features/ai-governance/charts'
import { aiPaths } from '@/features/ai-governance/shared'

/** AI governance in one tile: the last 30 days through VisorShield, with a daily trend (Premium). */
export function AiCard({ org, ai }: { org: string; ai: AiOverviewTile }) {
  return (
    <Card data-testid="ai-card">
      <CardHeader>
        <div>
          <CardTitle>AI governance</CardTitle>
          <CardDescription>Last 30 days through VisorShield.</CardDescription>
        </div>
        <StatusPill status={ai.status} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-3 gap-2">
          {[
            ['Calls', ai.calls, 'ai-calls'],
            ['PII masked', ai.piiMasked, 'ai-masked'],
            ['Blocked', ai.blocked, 'ai-blocked'],
          ].map(([label, value, id]) => (
            <div key={String(id)} className="flex flex-col gap-0.5">
              <dt className="label-caps">{label}</dt>
              <dd className="text-xl font-semibold" data-testid={String(id)}>
                {formatNumber(Number(value))}
              </dd>
            </div>
          ))}
        </dl>
        <Sparkline values={ai.series} />
        <Link
          href={aiPaths.overview(org)}
          className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
        >
          Open AI governance <ArrowRightIcon className="size-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  )
}
