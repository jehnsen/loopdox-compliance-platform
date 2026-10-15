'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MessageSquareTextIcon, SearchIcon } from 'lucide-react'
import { useSearch } from '@/lib/api/hooks/use-search'
import type { SearchGroup, SearchResultType } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { hasFeature } from '@/lib/entitlements'
import { cn } from '@/lib/utils/cn'
import { useDebouncedValue } from '@/lib/utils/use-debounced-value'
import { useSession } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { HighlightTerms, Highlighted } from '@/components/highlight'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

/** Results per group on the "all" view; a single type shows up to the API maximum. */
const PREVIEW = 5
const FULL = 50

function Group({ group, q, onShowAll }: { group: SearchGroup; q: string; onShowAll?: () => void }) {
  const headingId = `group-${group.type}`
  return (
    <section aria-labelledby={headingId} data-testid={`search-group-${group.type}`}>
      <h2 id={headingId} className="label-caps mb-2 flex items-center gap-2">
        {group.label}
        <span className="font-normal tabular-nums">{group.total}</span>
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {group.items.map((r) => (
          <li key={`${r.type}-${r.id}`}>
            <Link
              href={r.href}
              data-testid="search-result"
              className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2"
            >
              {r.ref ? (
                <IdChip className="mt-0.5">
                  <HighlightTerms text={r.ref} query={q} />
                </IdChip>
              ) : null}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">
                  <HighlightTerms text={r.title} query={q} />
                </span>
                {r.snippet ? (
                  <span className="text-sm text-muted">
                    <Highlighted text={r.snippet} />
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {onShowAll && group.total > group.items.length ? (
        <Button variant="link" size="sm" className="mt-1" onClick={onShowAll}>
          Show all {group.total} in {group.label.toLowerCase()}
        </Button>
      ) : null}
    </section>
  )
}

/** /[org]/search?q=…&type=…: every record the user can open that matches, grouped by type. */
export function SearchPage() {
  const { org } = useSession()
  const can = useCan()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const urlQ = params.get('q') ?? ''
  const type = (params.get('type') as SearchResultType | null) || null

  const [value, setValue] = useState(urlQ)
  const debounced = useDebouncedValue(value, 250)
  const q = debounced.trim()

  // Keep the URL in step with what was typed, so a search is a shareable link.
  useEffect(() => {
    if (q === urlQ.trim()) return
    const next = new URLSearchParams(params.toString())
    if (q) next.set('q', q)
    else next.delete('q')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    // Only typing drives this; the URL is not read back while the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const overview = useSearch(org.slug, q, { limit: PREVIEW })
  const focused = useSearch(org.slug, type ? q : '', {
    types: type ? [type] : undefined,
    limit: FULL,
  })

  const setType = (next: SearchResultType | null) => {
    const sp = new URLSearchParams(params.toString())
    if (next) sp.set('type', next)
    else sp.delete('type')
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
  }

  const facets = overview.data?.groups ?? []
  const groups = type ? (focused.data?.groups ?? []) : facets
  const total = facets.reduce((n, g) => n + g.total, 0)
  const loading = q.length >= 2 && (type ? focused.isLoading : overview.isLoading)
  const failed = type ? focused.isError : overview.isError
  const canAsk = can('ask.use') && hasFeature(org.tier, 'ask.policy')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Search"
        description="Policies, privacy records, controls and more, limited to what your role can open."
      />
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="flex max-w-2xl flex-col gap-1.5"
      >
        <Label htmlFor="search-q">Search records</Label>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            id="search-q"
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="A record ID, a title, or words from the text"
            className="h-10 pl-8 placeholder:text-muted"
            autoComplete="off"
            autoFocus
          />
        </div>
        <p className="text-sm text-muted">
          Every word you type has to match. Try an ID such as ITD-006 or DSR-2026-0012.
        </p>
      </form>

      {facets.length ? (
        <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-1.5">
          <FacetButton active={!type} onClick={() => setType(null)}>
            All <span className="tabular-nums">{total}</span>
          </FacetButton>
          {facets.map((g) => (
            <FacetButton key={g.type} active={type === g.type} onClick={() => setType(g.type)}>
              {g.label} <span className="tabular-nums">{g.total}</span>
            </FacetButton>
          ))}
        </div>
      ) : null}

      <div role="status" aria-live="polite" className="sr-only">
        {q.length >= 2 && !loading && !failed
          ? `${total} ${total === 1 ? 'result' : 'results'} for ${q}`
          : ''}
      </div>

      {q.length < 2 ? (
        <EmptyState
          icon={SearchIcon}
          title="Search everything you can open"
          body="Type at least 2 characters. Results are grouped by type, with the matching words highlighted."
        />
      ) : failed ? (
        <ErrorState
          title="Search didn’t work"
          body="We couldn’t reach the server. Try again."
          onRetry={() => void (type ? focused.refetch() : overview.refetch())}
        />
      ) : loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-32" />
        </div>
      ) : groups.length ? (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <Group
              key={g.type}
              group={g}
              q={q}
              onShowAll={type ? undefined : () => setType(g.type)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={SearchIcon}
          title={`No matches for “${q}”`}
          body="Check the spelling, use fewer words, or search for a record ID."
          actions={
            canAsk ? (
              <Button asChild variant="secondary">
                <Link href={`/${org.slug}/ask?q=${encodeURIComponent(q)}`}>
                  <MessageSquareTextIcon aria-hidden="true" />
                  Ask this instead
                </Link>
              </Button>
            ) : null
          }
        />
      )}
    </div>
  )
}

function FacetButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-sm',
        active
          ? 'border-accent bg-accent-soft font-medium text-accent'
          : 'border-line bg-surface text-fg hover:border-muted/50',
      )}
    >
      {children}
    </button>
  )
}
