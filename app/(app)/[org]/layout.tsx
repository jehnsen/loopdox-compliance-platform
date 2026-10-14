import { notFound } from 'next/navigation'
import { getMe, getUiPrefs } from '@/lib/server/session'
import { SessionProvider, type Session } from '@/components/providers/session-provider'
import { AppShell } from '@/components/shell/app-shell'
import { UiPrefsProvider } from '@/components/providers/ui-prefs'

export default async function OrgLayout({ children, params }: LayoutProps<'/[org]'>) {
  const { org } = await params
  const me = await getMe(org)
  // Not a member (or no such org): don't reveal which.
  if (!me.org || !me.tier) notFound()
  const session: Session = { ...me, org: me.org, tier: me.tier }
  const prefs = await getUiPrefs()
  return (
    <SessionProvider initial={session}>
      <UiPrefsProvider initialDensity={prefs.density}>
        <AppShell theme={prefs.theme} initialCollapsed={prefs.sidebarCollapsed}>
          {children}
        </AppShell>
      </UiPrefsProvider>
    </SessionProvider>
  )
}
