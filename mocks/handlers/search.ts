import type { SearchResponse, SearchResult, SearchResultType } from '@/lib/api/types'
import { json } from '@/mocks/http'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'

/**
 * Searchable sources. Each module adds one as its records arrive in the mock store.
 * A source returns candidate results the caller can see; matching happens here.
 */
export interface SearchSource {
  type: SearchResultType
  label: string
  items: (ctx: OrgCtx) => (SearchResult & { text: string })[]
}

export const searchSources: SearchSource[] = []

function snippet(text: string, q: string): string | null {
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return null
  const start = Math.max(0, i - 40)
  const end = Math.min(text.length, i + q.length + 60)
  return `${start > 0 ? '…' : ''}${text.slice(start, i)}«${text.slice(i, i + q.length)}»${text.slice(i + q.length, end)}${end < text.length ? '…' : ''}`
}

export const searchRoutes: RouteDef[] = [
  orgRoute('GET', '/search', {}, (ctx) => {
    const q = (ctx.query.get('q') ?? '').trim().toLowerCase()
    const body: SearchResponse = { q, groups: [] }
    if (q.length < 2) return json(body)
    for (const source of searchSources) {
      const items = source
        .items(ctx)
        .filter(
          (r) =>
            r.ref?.toLowerCase().includes(q) ||
            r.title.toLowerCase().includes(q) ||
            r.text.toLowerCase().includes(q),
        )
        .slice(0, 8)
        .map(({ text, ...r }) => ({ ...r, snippet: snippet(text, q) ?? r.snippet }))
      if (items.length) body.groups.push({ type: source.type, label: source.label, items })
    }
    return json(body)
  }),
]
