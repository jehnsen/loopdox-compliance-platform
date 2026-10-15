import type { SearchGroup, SearchResponse, SearchResult, SearchResultType } from '@/lib/api/types'
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

/** Group order in responses, whatever order modules registered their sources in. */
const GROUP_ORDER: readonly SearchResultType[] = [
  'document',
  'processing_activity',
  'pia',
  'dsr',
  'incident',
  'agreement',
  'system',
  'secret_record',
  'change',
  'risk',
  'decision',
  'control',
  'evidence',
  'ai_use_case',
]

export const SEARCH_DEFAULT_LIMIT = 8
export const SEARCH_MAX_LIMIT = 50

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Lower-cased words of the query. Every word has to match somewhere in a record. */
export function searchTerms(q: string): string[] {
  return [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))]
}

/** An excerpt around the first matching word, with every matching word wrapped in «». */
export function snippet(text: string, terms: string[]): string | null {
  const clean = text.replace(/[«»]/g, '')
  const lower = clean.toLowerCase()
  let at = -1
  let len = 0
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i >= 0 && (at < 0 || i < at)) {
      at = i
      len = t.length
    }
  }
  if (at < 0) return null
  const start = Math.max(0, at - 40)
  const end = Math.min(clean.length, at + len + 60)
  const marked = clean
    .slice(start, end)
    .replace(new RegExp(terms.map(escapeRegExp).join('|'), 'gi'), (m) => `«${m}»`)
  return `${start > 0 ? '…' : ''}${marked}${end < clean.length ? '…' : ''}`
}

/** 0 = exact ID, 1 = ID match, 2 = title match, 3 = body text only. Lower is better. */
function rank(r: SearchResult, q: string, terms: string[]): number {
  const ref = r.ref?.toLowerCase() ?? ''
  if (ref && ref === q) return 0
  if (ref && terms.some((t) => ref.includes(t))) return 1
  const title = r.title.toLowerCase()
  if (terms.every((t) => title.includes(t))) return 2
  return 3
}

function wanted(ctx: OrgCtx): Set<string> | null {
  const types = ctx.query
    .getAll('type')
    .flatMap((v) => v.split(','))
    .filter(Boolean)
  return types.length ? new Set(types) : null
}

function limitOf(ctx: OrgCtx): number {
  const n = Number(ctx.query.get('limit'))
  if (!Number.isFinite(n) || n < 1) return SEARCH_DEFAULT_LIMIT
  return Math.min(Math.floor(n), SEARCH_MAX_LIMIT)
}

export const searchRoutes: RouteDef[] = [
  orgRoute('GET', '/search', {}, (ctx) => {
    const q = (ctx.query.get('q') ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    const body: SearchResponse = { q, groups: [] }
    if (q.length < 2) return json(body)
    const terms = searchTerms(q)
    const types = wanted(ctx)
    const limit = limitOf(ctx)
    for (const source of searchSources) {
      if (types && !types.has(source.type)) continue
      const hits = source
        .items(ctx)
        .filter((r) => {
          const haystack = `${r.ref ?? ''} ${r.title} ${r.text}`.toLowerCase()
          return terms.every((t) => haystack.includes(t))
        })
        .map((r) => ({ r, rank: rank(r, q, terms) }))
        .sort((a, b) => a.rank - b.rank || a.r.title.localeCompare(b.r.title))
      if (!hits.length) continue
      const group: SearchGroup = {
        type: source.type,
        label: source.label,
        total: hits.length,
        items: hits.slice(0, limit).map(({ r: { text, ...r } }) => ({
          ...r,
          snippet: snippet(text, terms) ?? r.snippet,
        })),
      }
      body.groups.push(group)
    }
    body.groups.sort((a, b) => GROUP_ORDER.indexOf(a.type) - GROUP_ORDER.indexOf(b.type))
    return json(body)
  }),
]
