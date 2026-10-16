import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRightIcon } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/auth/permissions'
import { TIER_LABELS } from '@/lib/entitlements'
import { landingPath } from '@/lib/nav'
import { APP_NAME } from '@/lib/config'
import { getMe } from '@/lib/server/session'
import { LogoMark } from '@/components/logo-mark'
import { Card, CardContent } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Choose an organisation' }

export default async function SelectOrgPage() {
  const me = await getMe(null)
  const only = me.memberships.length === 1 ? me.memberships[0] : undefined
  if (only) redirect(landingPath(only.org.slug, only.roles, only.org.tier))

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10"
    >
      <span className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
        <LogoMark />
        {APP_NAME}
      </span>
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold">Choose an organisation</h1>
            <p className="text-base text-muted">
              Signed in as {me.user.name}. You can switch later from the top bar.
            </p>
          </div>
          {me.memberships.length === 0 ? (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-base">
              You aren’t a member of any organisation in {APP_NAME} yet. Ask your administrator for
              an invite.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {me.memberships.map((m) => (
                <li key={m.org.id}>
                  <Link
                    href={landingPath(m.org.slug, m.roles, m.org.tier)}
                    className="group flex items-center gap-3 rounded-md border border-line px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-accent-soft/30"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-sm font-semibold text-accent ring-1 ring-accent/15 ring-inset"
                    >
                      {m.org.name.slice(0, 1)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{m.org.name}</span>
                      <span className="truncate text-sm text-muted">
                        {TIER_LABELS[m.org.tier]} · {m.roles.map((r) => ROLE_LABELS[r]).join(', ')}
                      </span>
                    </span>
                    <ArrowRightIcon
                      className="size-4 text-muted transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
