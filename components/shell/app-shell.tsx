'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { MenuIcon, MessageSquareTextIcon, SearchIcon } from 'lucide-react'
import { can } from '@/lib/auth/permissions'
import { hasFeature } from '@/lib/entitlements'
import { en } from '@/lib/i18n/en'
import { ReportIncidentIcon } from '@/lib/nav'
import { useSession } from '@/components/providers/session-provider'
import { CommandPalette } from '@/components/shell/command-palette'
import { IdleTimeout } from '@/components/shell/idle-timeout'
import { NotificationsBell } from '@/components/shell/notifications-bell'
import { OrgSwitcher } from '@/components/shell/org-switcher'
import { SampleDataBanner } from '@/components/shell/sample-data-banner'
import { Brand, Sidebar, SidebarNav } from '@/components/shell/sidebar'
import type { ThemePref } from '@/components/shell/theme'
import { UserMenu } from '@/components/shell/user-menu'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

const SIDEBAR_COOKIE = 'loopdox_sidebar'

function TopBar({
  onOpenPalette,
  onOpenNav,
  theme,
}: {
  onOpenPalette: () => void
  onOpenNav: () => void
  theme: ThemePref
}) {
  const { org, roles, tier } = useSession()
  const canReport = hasFeature(tier, 'privacy') && can({ roles }, 'incidents.report')
  const canAsk = hasFeature(tier, 'ask.policy') && can({ roles }, 'ask.use')
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-surface/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-surface/85 sm:gap-2 lg:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenNav}
        aria-label={en.shell.openMenu}
      >
        <MenuIcon />
      </Button>
      <OrgSwitcher />
      <button
        type="button"
        onClick={onOpenPalette}
        className="ml-1 flex size-8 shrink-0 items-center justify-center gap-2 rounded-md border border-line bg-bg text-base text-muted hover:border-muted/50 sm:h-8 sm:w-auto sm:max-w-sm sm:min-w-0 sm:flex-1 sm:shrink sm:justify-start sm:px-2.5"
        aria-label={`${en.shell.search} (Control K)`}
        aria-keyshortcuts="Control+K Meta+K"
      >
        <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden truncate sm:inline">{en.shell.search}</span>
        <span className="ml-auto hidden items-center gap-0.5 md:flex" aria-hidden="true">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1">
        {canReport ? (
          <Button asChild variant="ghost" size="md" className="px-2 text-bad hover:text-bad">
            <Link
              href={`/${org.slug}/privacy/incidents/report`}
              aria-label={en.shell.reportIncident}
            >
              <ReportIncidentIcon aria-hidden="true" />
              <span className="hidden xl:inline">{en.shell.reportIncident}</span>
            </Link>
          </Button>
        ) : null}
        {canAsk ? (
          <Button asChild variant="secondary" size="md" className="px-2 sm:px-3">
            <Link href={`/${org.slug}/ask`} aria-label={en.shell.ask}>
              <MessageSquareTextIcon aria-hidden="true" />
              <span className="hidden sm:inline">{en.shell.ask}</span>
            </Link>
          </Button>
        ) : null}
        <NotificationsBell />
        <UserMenu initialTheme={theme} />
      </div>
    </header>
  )
}

export function AppShell({
  children,
  theme,
  initialCollapsed,
}: {
  children: ReactNode
  theme: ThemePref
  initialCollapsed: boolean
}) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      document.cookie = `${SIDEBAR_COOKIE}=${c ? 'expanded' : 'collapsed'}; path=/; max-age=31536000; samesite=lax`
      return !c
    })
  }

  return (
    <div
      className={
        collapsed ? 'flex min-h-dvh [--sidebar-w:3.5rem]' : 'flex min-h-dvh [--sidebar-w:15rem]'
      }
    >
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {en.shell.skipToContent}
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="lg:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b border-line px-4">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <SidebarNav onNavigate={() => setNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenNav={() => setNavOpen(true)}
          theme={theme}
        />
        <SampleDataBanner />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-content min-w-0 flex-1 px-4 py-6 outline-none lg:px-8"
        >
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <IdleTimeout />
    </div>
  )
}

export { SIDEBAR_COOKIE }
