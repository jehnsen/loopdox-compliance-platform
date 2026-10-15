'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { CornerDownLeftIcon, ListIcon, LockIcon, MessageSquareTextIcon } from 'lucide-react'
import { useSearch } from '@/lib/api/hooks/use-search'
import { useQuickAsk } from '@/features/ask/quick-ask'
import { can } from '@/lib/auth/permissions'
import { hasFeature } from '@/lib/entitlements'
import { en } from '@/lib/i18n/en'
import { DsrIcon, NewPolicyIcon, ReportIncidentIcon, visibleNav } from '@/lib/nav'
import { useDebouncedValue } from '@/lib/utils/use-debounced-value'
import { useSession } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { Highlighted } from '@/components/highlight'
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Kbd } from '@/components/ui/kbd'

function matches(text: string, q: string): boolean {
  return text.toLowerCase().includes(q.toLowerCase())
}

/**
 * ⌘K / Ctrl K: jump to pages, find records by ID or title, run quick actions,
 * or send the typed text to Ask.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const { org, roles, tier } = useSession()
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 200)
  const search = useSearch(org.slug, open ? debounced : '')

  const pages = useMemo(
    () =>
      visibleNav(org.slug, roles, tier).flatMap((g) =>
        g.items.map((it) => ({ ...it, group: g.label })),
      ),
    [org.slug, roles, tier],
  )

  const actions = useMemo(() => {
    const list: { id: string; label: string; href: string; icon: typeof ReportIncidentIcon }[] = []
    if (hasFeature(tier, 'privacy') && can({ roles }, 'incidents.report')) {
      list.push({
        id: 'report-incident',
        label: en.shell.reportIncident,
        href: `/${org.slug}/privacy/incidents/report`,
        icon: ReportIncidentIcon,
      })
    }
    if (hasFeature(tier, 'privacy') && can({ roles }, 'privacy.edit')) {
      list.push({
        id: 'new-dsr',
        label: 'New data subject request',
        href: `/${org.slug}/privacy/requests/new`,
        icon: DsrIcon,
      })
    }
    if (hasFeature(tier, 'policies') && can({ roles }, 'policies.edit')) {
      list.push({
        id: 'new-policy',
        label: 'New policy',
        href: `/${org.slug}/policies/new`,
        icon: NewPolicyIcon,
      })
    }
    return list
  }, [org.slug, roles, tier])

  const q = query.trim()
  const shownPages = q ? pages.filter((p) => matches(`${p.group} ${p.label}`, q)) : pages
  const shownActions = q ? actions.filter((a) => matches(a.label, q)) : actions
  const records = q.length >= 2 ? (search.data?.groups ?? []) : []
  const canAsk = can({ roles }, 'ask.use') && hasFeature(tier, 'ask.policy')
  const quickAsk = useQuickAsk()

  const setOpen = (o: boolean) => {
    if (!o) setQuery('')
    onOpenChange(o)
  }

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search pages and records, run quick actions, or ask a question."
    >
      <Command shouldFilter={false} loop>
        <CommandInput value={query} onValueChange={setQuery} placeholder={en.palette.placeholder} />
        <CommandList>
          {records.map((group) => (
            <CommandGroup key={group.type} heading={group.label}>
              {group.items.map((r) => (
                <CommandItem
                  key={`${r.type}-${r.id}`}
                  value={`record-${r.type}-${r.id}`}
                  onSelect={() => go(r.href)}
                >
                  {r.ref ? <IdChip>{r.ref}</IdChip> : null}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{r.title}</span>
                    {r.snippet ? (
                      <span className="truncate text-xs text-muted">
                        <Highlighted text={r.snippet} />
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {q.length >= 2 && search.isFetching && !records.length ? (
            <p className="px-3 py-2 text-sm text-muted" role="status">
              {en.palette.searching}
            </p>
          ) : null}
          {shownActions.length ? (
            <CommandGroup heading={en.palette.actions}>
              {shownActions.map((a) => (
                <CommandItem key={a.id} value={`action-${a.id}`} onSelect={() => go(a.href)}>
                  <a.icon aria-hidden="true" />
                  {a.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {shownPages.length ? (
            <CommandGroup heading={en.palette.pages}>
              {shownPages.map((p) => (
                <CommandItem key={p.id} value={`page-${p.id}`} onSelect={() => go(p.href)}>
                  <p.icon aria-hidden="true" />
                  <span className="truncate">
                    {p.group !== p.label ? <span className="text-muted">{p.group} › </span> : null}
                    {p.label}
                  </span>
                  {p.locked ? (
                    <LockIcon className="ml-auto size-3.5" aria-label={en.shell.locked} />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {q.length >= 2 ? (
            <CommandGroup heading="Search">
              <CommandItem
                value="search-all"
                onSelect={() => go(`/${org.slug}/search?q=${encodeURIComponent(q)}`)}
              >
                <ListIcon aria-hidden="true" />
                <span className="truncate">
                  See all results for <span className="font-medium">{q}</span>
                </span>
                <CornerDownLeftIcon className="ml-auto" aria-hidden="true" />
              </CommandItem>
            </CommandGroup>
          ) : null}
          {q && canAsk ? (
            <CommandGroup heading={en.shell.ask}>
              <CommandItem
                value="ask"
                onSelect={() => {
                  setOpen(false)
                  quickAsk.open(q)
                }}
              >
                <MessageSquareTextIcon aria-hidden="true" />
                <span className="truncate">
                  {en.palette.askPrefix}
                  <span className="font-medium">{q}</span>
                </span>
                <CornerDownLeftIcon className="ml-auto" aria-hidden="true" />
              </CommandItem>
            </CommandGroup>
          ) : null}
          {q &&
          !canAsk &&
          !shownPages.length &&
          !shownActions.length &&
          !records.length &&
          !search.isFetching ? (
            <p className="px-3 py-6 text-center text-base text-muted">No matches.</p>
          ) : null}
        </CommandList>
        <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> to open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> to close
          </span>
        </div>
      </Command>
    </CommandDialog>
  )
}
