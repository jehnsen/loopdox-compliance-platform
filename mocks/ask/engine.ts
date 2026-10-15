import type { AskContext, AskRoute, Citation, RecordType } from '@/lib/api/types'
import { hasFeature } from '@/lib/entitlements'
import { isAuditorOnly } from '@/lib/auth/permissions'
import { RECORD_LABELS } from '@/lib/links'
import {
  answerFromPolicies,
  matches,
  notFound,
  number,
  queryTerms,
  stem,
  stems,
  type Answer,
} from '@/mocks/ask/policies'
import { groupsFor } from '@/mocks/handlers/links'
import { searchSources } from '@/mocks/handlers/search'
import { RECORDS } from '@/mocks/records'
import type { OrgCtx } from '@/mocks/router'

/**
 * Ask routing, plus the records and impact routes. Policy retrieval lives in
 * ./policies (no handler imports, so the seed can use it).
 */

// ---------------------------------------------------------------------------
// Records and impact
// ---------------------------------------------------------------------------

/** Words naming a register, mapped to its type. "Which systems…" asks about systems. */
const TYPE_WORDS: [RegExp, RecordType | 'evidence'][] = [
  [/\bsystems?\b|\bservers?\b|\bdatabases?\b|\bassets?\b/i, 'system'],
  [/\brisks?\b/i, 'risk'],
  [/\bprocessing\b|\bprocessing records?\b/i, 'processing_activity'],
  [/\bdsrs?\b|\bsubject requests?\b/i, 'dsr'],
  [/\bincidents?\b|\bbreach(es)?\b/i, 'incident'],
  [/\bagreements?\b|\bcontracts?\b|\bdpas?\b|\bvendors?\b/i, 'agreement'],
  [/\bsecrets?\b|\bkeys?\b/i, 'secret_record'],
  [/\bchanges?\b|\bdeploy(s|ments)?\b/i, 'change'],
  [/\bdecisions?\b|\badrs?\b/i, 'decision'],
  [/\bcontrols?\b/i, 'control'],
  [/\bevidence\b/i, 'evidence'],
  [/\bimpact assessments?\b|\bpias?\b/i, 'pia'],
]

const TYPE_WORD_STEMS = new Set(
  'system server database asset risk processing record dsr subject request incident breach agreement contract dpa vendor secret key change deploy deployment decision adr control evidence impact assessment pia open'
    .split(' ')
    .map(stem),
)

/** Extra searchable text from a stored record's own fields (never identities). */
function recordFacts(ctx: OrgCtx, type: RecordType, id: string): string {
  const stored = RECORDS[type].stored(ctx, id)
  if (!stored) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(stored)) {
    if (
      /^(id|orgId|createdBy|updatedBy|owner|requester|.*Ids?)$/.test(key) ||
      /requester/i.test(key)
    )
      continue
    if (typeof value === 'string' && !/^\d{4}-\d\d-\d\d/.test(value))
      parts.push(value.replace(/_/g, ' '))
    else if (Array.isArray(value) && value.every((v) => typeof v === 'string'))
      parts.push(value.join(' ').replace(/_/g, ' '))
    else if (value === true) parts.push(key.replace(/([A-Z])/g, ' $1').toLowerCase())
  }
  return parts.join(' ')
}

interface Candidate {
  type: RecordType | 'evidence'
  id: string
  ref: string | null
  title: string
  href: string
  text: string
}

function candidates(ctx: OrgCtx, allowEvidenceOnly: boolean): Candidate[] {
  const out: Candidate[] = []
  for (const source of searchSources) {
    if (source.type === 'document' || source.type === 'ai_use_case') continue
    if (allowEvidenceOnly && source.type !== 'evidence' && source.type !== 'control') continue
    for (const item of source.items(ctx)) {
      const type = item.type as RecordType | 'evidence'
      const facts = type === 'evidence' ? '' : recordFacts(ctx, type, item.id)
      out.push({
        type,
        id: item.id,
        ref: item.ref,
        title: item.title,
        href: item.href,
        text: `${item.text} ${facts}`,
      })
    }
  }
  return out
}

const REF_PATTERN = /\b([A-Z]{2,5}-(?:\d{4}-)?\d{3,4}|A\.\d+\.\d+)\b/gi

export function answerFromRecords(ctx: OrgCtx, question: string): Answer {
  const auditorOnly = isAuditorOnly({ roles: ctx.roles })
  const all = candidates(ctx, auditorOnly)
  const refs = [...question.matchAll(REF_PATTERN)].map((m) => m[1]?.toUpperCase())
  let picked = all.filter((c) => c.ref && refs.includes(c.ref.toUpperCase()))

  if (!picked.length) {
    const typeHit = TYPE_WORDS.find(([re]) => re.test(question))?.[1]
    const pool = typeHit ? all.filter((c) => c.type === typeHit) : all
    const terms = queryTerms(question).filter((alts) => !alts.every((a) => TYPE_WORD_STEMS.has(a)))
    if (!terms.length) {
      picked = typeHit ? pool.slice(0, 8) : []
    } else {
      const needed = Math.max(1, Math.ceil(terms.length * 0.6))
      picked = pool
        .map((c) => ({ c, m: matches(terms, stems(`${c.ref ?? ''} ${c.title} ${c.text}`)) }))
        .filter((x) => x.m >= needed)
        .sort((a, b) => b.m - a.m)
        .slice(0, 8)
        .map((x) => x.c)
    }
  }
  if (!picked.length) return notFound(ctx, 'records')

  const citations = number(
    picked.map((c) => ({
      kind: c.type === 'evidence' ? ('evidence' as const) : ('record' as const),
      label: [c.ref, c.title].filter(Boolean).join(' '),
      href: c.href,
      excerpt: c.text.trim().slice(0, 200) || null,
    })),
  )
  const noun = picked.length === 1 ? 'record matches' : 'records match'
  const lines = citations.map((c) => `- ${c.label} [${c.n}]`)
  return {
    route: 'records',
    content: `${picked.length} ${noun} your question:\n\n${lines.join('\n')}`,
    citations,
    grounded: true,
    suggestions: [],
  }
}

export function answerImpact(ctx: OrgCtx, question: string, context?: AskContext | null): Answer {
  const all = candidates(ctx, false).filter(
    (c): c is Candidate & { type: RecordType } => c.type !== 'evidence',
  )
  const docs = RECORDS.document.visible(ctx).map((d) => ({ ...d, text: '' }))
  const pool: (Candidate & { type: RecordType })[] = [...all, ...docs]
  const refs = [...question.matchAll(REF_PATTERN)].map((m) => m[1]?.toUpperCase())
  // "What does this record affect?" asked from a record's page means that record.
  let target =
    context && /\bthis\b/i.test(question)
      ? pool.find((c) => c.type === context.type && c.id === context.id)
      : undefined
  target ??= pool.find((c) => c.ref && refs.includes(c.ref.toUpperCase()))
  if (!target) {
    const terms = queryTerms(question).filter(
      (alts) => !alts.some((a) => ['impact', 'affect', 'chang', 'touch', 'depend'].includes(a)),
    )
    target = terms.length
      ? pool
          .map((c) => ({ c, m: matches(terms, stems(c.title)) }))
          .filter((x) => x.m >= Math.max(1, Math.ceil(terms.length * 0.6)))
          .sort((a, b) => b.m - a.m)[0]?.c
      : undefined
  }
  if (!target && context) target = pool.find((c) => c.type === context.type && c.id === context.id)
  if (!target) return notFound(ctx, 'impact')

  let groups: ReturnType<typeof groupsFor> = []
  try {
    groups = groupsFor(ctx, target.type, target.id).filter((g) => g.items.length)
  } catch {
    groups = []
  }
  const label = [target.ref, target.title].filter(Boolean).join(' ')
  const cites: Omit<Citation, 'n'>[] = [{ kind: 'record', label, href: target.href, excerpt: null }]
  const lines: string[] = []
  for (const g of groups) {
    const refs = g.items.slice(0, 6).map((item) => {
      cites.push({
        kind: 'record',
        label: [item.ref, item.title].filter(Boolean).join(' '),
        href: item.href,
        excerpt: null,
      })
      return `${[item.ref, item.title].filter(Boolean).join(' ')} [${cites.length}]`
    })
    const more = g.items.length > 6 ? `, and ${g.items.length - 6} more` : ''
    lines.push(
      `- **${g.items.length} ${g.items.length === 1 ? RECORD_LABELS[g.type].one.toLowerCase() : g.label.toLowerCase()}:** ${refs.join(', ')}${more}`,
    )
  }
  const content = lines.length
    ? `A change to ${label} [1] touches the records linked to it:\n\n${lines.join('\n')}`
    : `${label} [1] isn’t linked to any other record yet, so nothing else is recorded as depending on it.`
  return { route: 'impact', content, citations: number(cites), grounded: true, suggestions: [] }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export function allowedRoutes(ctx: OrgCtx): AskRoute[] {
  const routes: AskRoute[] = []
  if (hasFeature(ctx.org.tier, 'ask.policy')) routes.push('policy')
  if (hasFeature(ctx.org.tier, 'ask.records')) routes.push('records')
  if (hasFeature(ctx.org.tier, 'ask.impact') && !isAuditorOnly({ roles: ctx.roles }))
    routes.push('impact')
  return routes
}

/** Automatic routing: impact words → impact; register words or record IDs → records; else policy. */
export function classify(question: string, allowed: AskRoute[]): AskRoute {
  const impact =
    /\b(impact|affect(s|ed)?|what happens if|if we (change|replace|remove)|depend(s|ency|encies)? on|blast radius|touch(es)?)\b/i
  if (allowed.includes('impact') && impact.test(question)) return 'impact'
  const records =
    /\b(which|list|how many|show me)\b.*\b(systems?|risks?|dsrs?|incidents?|agreements?|vendors?|processing|secrets?|changes?|decisions?|controls?|evidence|requests?)\b/i
  if (
    allowed.includes('records') &&
    (records.test(question) || new RegExp(REF_PATTERN.source, 'i').test(question))
  ) {
    // A policy ID ("What does ITD-007 say?") is a policy question.
    if (!/\b(ITD|CLN|SEC)-\d{3}\b/i.test(question)) return 'records'
  }
  return 'policy'
}

export function answer(
  ctx: OrgCtx,
  question: string,
  opts: { route?: AskRoute | null; asOf?: string | null; context?: AskContext | null },
): Answer {
  const allowed = allowedRoutes(ctx)
  const route = opts.route ?? classify(question, allowed)
  if (route === 'impact') {
    const a = answerImpact(ctx, question, opts.context)
    return a.grounded || opts.route ? a : answerFromPolicies(ctx, question, opts)
  }
  if (route === 'records') {
    const a = answerFromRecords(ctx, question)
    return a.grounded || opts.route ? a : answerFromPolicies(ctx, question, opts)
  }
  return answerFromPolicies(ctx, question, opts)
}

/** Splits an answer into stream tokens of a few words each. */
export function tokenize(content: string): string[] {
  const parts = content.match(/\S+\s*|\s+/g) ?? []
  const tokens: string[] = []
  for (let i = 0; i < parts.length; i += 2) tokens.push(parts.slice(i, i + 2).join(''))
  return tokens
}
