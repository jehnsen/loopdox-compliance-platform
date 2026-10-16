'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LockIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, ShieldCheckIcon } from 'lucide-react'
import { APP_NAME } from '@/lib/config'
import { TIER_LABELS } from '@/lib/entitlements'
import { en } from '@/lib/i18n/en'
import { cn } from '@/lib/utils/cn'
import { visibleNav, type VisibleNavItem } from '@/lib/nav'
import { useSession } from '@/components/providers/session-provider'
import { PremiumBadge } from '@/components/chips'
import { LogoMark } from '@/components/logo-mark'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function useActiveHref(items: VisibleNavItem[]): string | null {
  const pathname = usePathname()
  let best: string | null = null
  for (const it of items) {
    const match =
      it.path === ''
        ? pathname === it.href
        : pathname === it.href || pathname.startsWith(`${it.href}/`)
    if (match && (!best || it.href.length > best.length)) best = it.href
  }
  return best
}

/** Focus ring that stays visible on the dark rail. */
const NAV_FOCUS = 'focus-visible:outline-nav-accent'

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: VisibleNavItem
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      data-locked={item.locked || undefined}
      className={cn(
        'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-base text-nav-fg transition-colors hover:bg-nav-hover hover:text-nav-strong',
        NAV_FOCUS,
        active &&
          'bg-nav-active font-medium text-nav-strong before:absolute before:inset-y-1.5 before:left-0 before:w-0.75 before:rounded-full before:bg-nav-accent hover:bg-nav-active',
        item.locked && !active && 'text-nav-muted',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0 text-nav-muted transition-colors group-hover:text-nav-fg',
          active && 'text-nav-accent group-hover:text-nav-accent',
        )}
        aria-hidden="true"
      />
      {collapsed ? (
        <span className="sr-only">
          {item.label}
          {item.locked ? ` (${en.shell.locked})` : ''}
        </span>
      ) : (
        <>
          <span className="truncate">{item.label}</span>
          {item.locked ? (
            <LockIcon
              className="ml-auto size-3.5 shrink-0 text-nav-muted"
              aria-label={en.shell.locked}
            />
          ) : null}
        </>
      )}
    </Link>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {item.locked ? ` · ${en.shell.locked}` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

const navPremium = 'border-nav-premium/40 text-nav-premium'

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const { org, roles, tier } = useSession()
  const groups = visibleNav(org.slug, roles, tier)
  const active = useActiveHref(groups.flatMap((g) => g.items))
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((group) => {
        const single = group.items.length === 1 && group.items[0]?.label === group.label
        return (
          <div key={group.id} className="flex flex-col gap-0.5">
            {!single && !collapsed ? (
              <div className="flex items-center gap-2 px-2.5 pb-1.5">
                <span className="text-2xs font-semibold tracking-[0.08em] text-nav-muted uppercase">
                  {group.label}
                </span>
                {group.premium ? <PremiumBadge className={navPremium} /> : null}
              </div>
            ) : null}
            {collapsed && !single ? (
              <div aria-hidden="true" className="mx-2 mb-1.5 h-px bg-nav-line" />
            ) : null}
            {single && group.premium && !collapsed ? (
              <PremiumBadge className={cn('ml-2.5', navPremium)} />
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavLink
                    item={item}
                    active={active === item.href}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

/** Logo and product name, for the dark rail. */
export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {collapsed ? (
        <span className="sr-only">{APP_NAME}</span>
      ) : (
        <span className="flex min-w-0 flex-col">
          <span className="text-md leading-5 font-semibold tracking-tight text-nav-strong">
            {APP_NAME}
          </span>
          <span className="truncate text-2xs leading-4 text-nav-muted">{en.app.descriptor}</span>
        </span>
      )}
    </span>
  )
}

/** Plan summary at the foot of the rail. */
function PlanFooter() {
  const { org, tier } = useSession()
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-md border border-nav-line px-2.5 py-2">
      <ShieldCheckIcon className="size-4 shrink-0 text-nav-accent" aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-nav-strong">{org.name}</span>
        <span className="truncate text-2xs text-nav-muted">{TIER_LABELS[tier]} plan</span>
      </span>
    </div>
  )
}

/** Mobile drawer contents: the same rail, inside the sheet. */
export function SidebarDrawerBody({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center border-b border-nav-line px-4">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="border-t border-nav-line p-3">
        <PlanFooter />
      </div>
    </>
  )
}

/** Desktop sidebar (≥1024px). Below that the same nav renders in a drawer from the top bar. */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { org } = useSession()
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-nav-line bg-nav text-nav-fg lg:flex',
        collapsed ? 'w-14' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-nav-line',
          collapsed ? 'justify-center' : 'px-4',
        )}
      >
        <Link
          href={`/${org.slug}`}
          aria-label={`${APP_NAME} overview`}
          className={cn('rounded-md', NAV_FOCUS)}
        >
          <Brand collapsed={collapsed} />
        </Link>
      </div>
      <div className={cn('flex-1 overflow-y-auto py-5', collapsed ? 'px-2' : 'px-3')}>
        <SidebarNav collapsed={collapsed} />
      </div>
      <div
        className={cn(
          'flex flex-col gap-2 border-t border-nav-line p-3',
          collapsed && 'items-center px-2',
        )}
      >
        {collapsed ? null : <PlanFooter />}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'flex h-8 items-center gap-2 rounded-md px-2.5 text-sm text-nav-muted transition-colors hover:bg-nav-hover hover:text-nav-strong',
            NAV_FOCUS,
            collapsed && 'w-8 justify-center px-0',
          )}
          aria-label={collapsed ? en.shell.expandSidebar : en.shell.collapseSidebar}
        >
          {collapsed ? (
            <PanelLeftOpenIcon className="size-4" />
          ) : (
            <PanelLeftCloseIcon className="size-4" />
          )}
          {collapsed ? null : <span>{en.shell.collapseSidebar}</span>}
        </button>
      </div>
    </aside>
  )
}
