'use client'

import Link from 'next/link'
import { MessageSquareTextIcon } from 'lucide-react'
import { useOverview } from '@/lib/api/hooks/use-overview'
import { useCan } from '@/lib/auth/can'
import { isAuditorOnly, ROLE_LABELS } from '@/lib/auth/permissions'
import { hasFeature, TIER_LABELS } from '@/lib/entitlements'
import { en } from '@/lib/i18n/en'
import { ReportIncidentIcon, visibleNav } from '@/lib/nav'
import { useSession } from '@/components/providers/session-provider'
import { PageHeader } from '@/components/page-header'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AiCard } from '@/features/overview/ai-card'
import { AskBox } from '@/features/overview/ask-box'
import { CoverageCard } from '@/features/overview/coverage-card'
import { DocumentsCard } from '@/features/overview/documents-card'
import { NeedsAttention } from '@/features/overview/needs-attention'
import { PoliciesToRead } from '@/features/overview/policies-to-read'
import { RecentActivity } from '@/features/overview/recent-activity'

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Loading the dashboard">
      <Skeleton className="h-72 lg:col-span-2" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-34" />
        <Skeleton className="h-34" />
      </div>
      <Skeleton className="h-56 lg:col-span-3" />
    </div>
  )
}

/** Summary first: needs-attention list, document and control tiles, then recent activity. */
function Dashboard({ operational }: { operational: boolean }) {
  const { org } = useSession()
  const { data, isLoading, isError, refetch } = useOverview(org.slug)
  if (isLoading) return <DashboardSkeleton />
  if (isError || !data) {
    return (
      <ErrorState
        title="Couldn’t load the dashboard"
        body="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    )
  }
  const tiles = (
    <>
      {data.documents ? <DocumentsCard org={org.slug} counts={data.documents} /> : null}
      {data.controlCoverage ? <CoverageCard coverage={data.controlCoverage} /> : null}
      {data.ai ? <AiCard org={org.slug} ai={data.ai} /> : null}
    </>
  )
  return (
    <>
      {operational ? (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <NeedsAttention attention={data.attention} />
          </div>
          <div className="flex flex-col gap-4">{tiles}</div>
        </div>
      ) : data.documents || data.controlCoverage || data.ai ? (
        <div className="grid items-start gap-4 md:grid-cols-2">{tiles}</div>
      ) : null}
      {data.recentActivity ? <RecentActivity items={data.recentActivity} /> : null}
    </>
  )
}

export function OverviewPage() {
  const session = useSession()
  const { org, user, roles, tier } = session
  const can = useCan()
  const staffOnly = roles.every((r) => r === 'staff')
  const groups = visibleNav(org.slug, roles, tier).filter((g) => g.id !== 'overview')
  const canReport = hasFeature(tier, 'privacy') && can('incidents.report')
  const canAsk = hasFeature(tier, 'ask.policy') && can('ask.use')
  const auditor = isAuditorOnly(session)
  // Staff get the simplified overview. VisorShield-only tenants have no registers to
  // summarise, so their dashboard is the AI governance tile alone.
  const showDashboard = !staffOnly

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Good to see you, ${user.name.split(' ')[0]}`}
        description={`${org.name} · ${TIER_LABELS[tier]} plan · ${roles.map((r) => ROLE_LABELS[r]).join(', ')}`}
        actions={
          <>
            {canReport ? (
              <Button asChild variant="secondary">
                <Link href={`/${org.slug}/privacy/incidents/report`}>
                  <ReportIncidentIcon aria-hidden="true" />
                  {en.shell.reportIncident}
                </Link>
              </Button>
            ) : null}
            {canAsk ? (
              <Button asChild variant="primary">
                <Link href={`/${org.slug}/ask`}>
                  <MessageSquareTextIcon aria-hidden="true" />
                  Ask a question
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {staffOnly && hasFeature(tier, 'policies') ? <PoliciesToRead /> : null}
      {staffOnly && canAsk ? <AskBox /> : null}

      {auditor ? (
        <p className="rounded-md border border-line bg-surface px-4 py-3 text-base">
          You have read-only guest access to {org.name}. You can view approved policies, registers
          and evidence. Nothing you do here changes their records.
        </p>
      ) : null}

      {showDashboard ? <Dashboard operational={!auditor && tier !== 'visorshield_only'} /> : null}

      <section aria-labelledby="areas" className="flex flex-col gap-3">
        <h2 id="areas" className="label-caps">
          Your areas
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const first = g.items[0]
            if (!first) return null
            const locked = g.items.every((i) => i.locked)
            return (
              <li key={g.id}>
                <Link
                  href={first.href}
                  className="flex h-full items-start gap-3 rounded-lg border border-line bg-surface p-4 hover:border-accent/50"
                >
                  <g.icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      {g.label}
                      {locked ? (
                        <span className="ml-2 text-xs font-normal text-muted">
                          {en.shell.locked}
                        </span>
                      ) : null}
                    </span>
                    {g.items.length > 1 || first.label !== g.label ? (
                      <span className="text-sm text-muted">
                        {g.items.map((i) => i.label).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
