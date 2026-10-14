'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LockIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { APP_NAME } from '@/lib/config'
import { en } from '@/lib/i18n/en'
import { cn } from '@/lib/utils/cn'
import { visibleNav, type VisibleNavItem } from '@/lib/nav'
import { useSession } from '@/components/providers/session-provider'
import { PremiumBadge } from '@/components/chips'
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
        'flex h-8 items-center gap-2.5 rounded-md px-2 text-base text-muted transition-colors hover:bg-surface-2 hover:text-fg',
        active && 'bg-accent-soft font-medium text-fg hover:bg-accent-soft',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className={cn('size-4 shrink-0', active && 'text-accent')} aria-hidden="true" />
      {collapsed ? (
        <span className="sr-only">
          {item.label}
          {item.locked ? ` (${en.shell.locked})` : ''}
        </span>
      ) : (
        <>
          <span className="truncate">{item.label}</span>
          {item.locked ? (
            <LockIcon className="ml-auto size-3.5 shrink-0" aria-label={en.shell.locked} />
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
    <nav aria-label="Main" className="flex flex-col gap-4">
      {groups.map((group) => {
        const single = group.items.length === 1 && group.items[0]?.label === group.label
        return (
          <div key={group.id} className="flex flex-col gap-0.5">
            {!single && !collapsed ? (
              <div className="flex items-center gap-2 px-2 pb-1">
                <span className="label-caps">{group.label}</span>
                {group.premium ? <PremiumBadge /> : null}
              </div>
            ) : null}
            {single && group.premium && !collapsed ? <PremiumBadge className="ml-2" /> : null}
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

export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span
        aria-hidden="true"
        className="flex size-6 items-center justify-center rounded-md bg-accent font-mono text-xs font-bold text-accent-fg"
      >
        {APP_NAME.slice(0, 1)}
      </span>
      {collapsed ? (
        <span className="sr-only">{APP_NAME}</span>
      ) : (
        <span className="text-md">{APP_NAME}</span>
      )}
    </span>
  )
}

/** Desktop sidebar (≥1024px). Below that the same nav renders in a drawer from the top bar. */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { org } = useSession()
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface lg:flex',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b border-line',
          collapsed ? 'justify-center' : 'px-4',
        )}
      >
        <Link href={`/${org.slug}`} aria-label={`${APP_NAME} overview`}>
          <Brand collapsed={collapsed} />
        </Link>
      </div>
      <div className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className={cn('border-t border-line p-2', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
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
