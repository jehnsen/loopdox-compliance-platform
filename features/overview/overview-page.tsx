'use client'

import Link from 'next/link'
import { MessageSquareTextIcon } from 'lucide-react'
import { useCan } from '@/lib/auth/can'
import { isAuditorOnly, ROLE_LABELS } from '@/lib/auth/permissions'
import { hasFeature, TIER_LABELS } from '@/lib/entitlements'
import { en } from '@/lib/i18n/en'
import { ReportIncidentIcon, visibleNav } from '@/lib/nav'
import { useSession } from '@/components/providers/session-provider'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Overview. The full dashboard (tiles, needs-attention list, activity) arrives in
 * M4; this version orients the user and links to what their role can do.
 */
export function OverviewPage() {
  const session = useSession()
  const { org, user, roles, tier } = session
  const can = useCan()
  const staffOnly = roles.every((r) => r === 'staff')
  const groups = visibleNav(org.slug, roles, tier).filter((g) => g.id !== 'overview')
  const canReport = hasFeature(tier, 'privacy') && can('incidents.report')
  const canAsk = hasFeature(tier, 'ask.policy') && can('ask.use')

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

      {staffOnly ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Policies to read</CardTitle>
              <CardDescription>
                Approved policies you need to read and acknowledge appear here.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link href={`/${org.slug}/my-policies`}>Open My policies</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isAuditorOnly(session) ? (
        <p className="rounded-md border border-line bg-surface px-4 py-3 text-base">
          You have read-only guest access to {org.name}. You can view approved policies, registers
          and evidence. Nothing you do here changes their records.
        </p>
      ) : null}

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
