import { fromZonedTime } from 'date-fns-tz'
import type {
  AskContext,
  AskRoute,
  Citation,
  Document,
  Org,
  Permission,
  Role,
} from '@/lib/api/types'
import { hasFeature } from '@/lib/entitlements'
import { splitSections } from '@/lib/markdown/sections'
import { formatCalendarDate } from '@/lib/utils/dates'
import type { MockDB } from '@/mocks/store'

/**
 * What policy retrieval needs from a request. A subset of OrgCtx, so the seed can
 * draft sample answers without importing the route handlers.
 */
export interface AskCtx {
  db: MockDB
  org: Org
  roles: Role[]
  can: (permission: Permission) => boolean
}

/**
 * The mock "RAG" behind Ask and questionnaire drafting. It retrieves passages from
 * approved policy text (or the registers), and only ever states what a passage says,
 * each statement with a citation. When nothing matches it says so.
 *
 * The real pipeline is the backend's; this keeps the contract and the behaviour
 * (cited or "couldn't find") realistic for the UI.
 */

export interface Answer {
  route: AskRoute
  content: string
  citations: Citation[]
  grounded: boolean
  suggestions: string[]
}

// ---------------------------------------------------------------------------
// Text matching
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  `a an and are as at be been but by can could did do does doing for from had has have how i if in into is it its
  me my of on or our ours should so than that the their them then there these they this those to us was we were what
  when where which who whom why will with would you your about any all also each every much many more most other
  some such tell show list give find please need must may might shall per via within without say says said
  policy policies document documents company 3rdloop require requires required requirement`
    .split(/\s+/)
    .filter(Boolean),
)

/** Words that mean the same thing in a question and in a policy. */
const SYNONYMS: Record<string, string[]> = {
  mfa: ['multi-factor', 'multifactor', 'two-factor', '2-step', 'authentication'],
  '2fa': ['multi-factor', 'authentication'],
  laptop: ['device', 'devices'],
  phone: ['device', 'devices'],
  password: ['passwords', 'credentials', 'authentication'],
  breach: ['breaches', 'incident', 'incidents'],
  hack: ['incident', 'breach'],
  ai: ['ai', 'chatgpt', 'visorshield'],
  chatgpt: ['ai', 'public', 'tools'],
  encrypt: ['encrypted', 'encryption', 'cryptography'],
  encryption: ['encrypted'],
  backup: ['backups', 'backed'],
  vendor: ['supplier', 'suppliers', 'third'],
  supplier: ['vendor', 'suppliers'],
  retention: ['retention', 'kept', 'retain'],
  keep: ['kept', 'retention'],
  delete: ['deleted', 'disposal', 'erase'],
  dsr: ['request', 'requests', 'rights'],
  npc: ['commission', 'notify', 'notified', 'notification'],
  notify: ['notified', 'notification', 'notifies'],
  review: ['reviewed', 'reviews'],
  access: ['access', 'privileged'],
  admin: ['administrator', 'privileged'],
  patch: ['patches', 'patched', 'vulnerabilities'],
  log: ['logs', 'logging'],
  train: ['training', 'awareness'],
  training: ['awareness'],
  national: ['npc'],
  commission: ['npc'],
  customer: ['client', 'clients'],
  customers: ['client', 'clients'],
  staff: ['everyone', 'employees'],
  employee: ['everyone', 'staff'],
  lost: ['loss', 'lose', 'disclosed', 'breach'],
  lose: ['lost', 'loss'],
  stolen: ['lost', 'theft'],
}

export function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3)
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2)
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? []
}

/** Content words of a question, each with its synonyms. */
export function queryTerms(question: string): string[][] {
  const seen = new Set<string>()
  const terms: string[][] = []
  for (const w of words(question)) {
    if (STOPWORDS.has(w) || w.length < 2 || seen.has(w)) continue
    seen.add(w)
    terms.push([...new Set([w, ...(SYNONYMS[w] ?? [])].map(stem))])
  }
  return terms
}

export function stems(text: string): Set<string> {
  return new Set(words(text).map(stem))
}

/** How many of the question's terms appear in `text` (a term matches if any synonym does). */
export function matches(terms: string[][], text: Set<string>): number {
  return terms.filter((alts) =>
    alts.some((a) => text.has(a) || [...text].some((t) => t.startsWith(a) && a.length >= 4)),
  ).length
}

function sentence(text: string): string {
  const t = text.trim()
  return /[.!?:]$/.test(t) ? t : `${t}.`
}

// ---------------------------------------------------------------------------
// Policy corpus
// ---------------------------------------------------------------------------

interface Passage {
  doc: Document
  version: number
  sectionId: string
  heading: string
  text: string
  /** Purpose or Scope: says what the policy is about, rarely what it requires. */
  intro: boolean
}

/** End of a calendar day in the tenant timezone. */
function endOfDay(ctx: AskCtx, date: string): number {
  return fromZonedTime(`${date}T23:59:59.999`, ctx.org.timezone).getTime()
}

/** The version of `doc` in force at time `t`, or null. Uses the approval and retirement history. */
export function versionInForce(ctx: AskCtx, doc: Document, t: number): number | null {
  const events = ctx.db.workflowEvents
    .filter((w) => w.documentId === doc.id && Date.parse(w.at) <= t)
    .sort((a, b) => a.at.localeCompare(b.at))
  let version: number | null = null
  for (const e of events) {
    if (e.type === 'approve') version = e.version
    if (e.type === 'retire') version = null
  }
  // Published without approval (no workflow): in force from approvedAt.
  if (
    version === null &&
    !events.length &&
    doc.approvedVersion &&
    doc.approvedAt &&
    Date.parse(doc.approvedAt) <= t
  ) {
    return doc.approvedVersion
  }
  return version
}

/**
 * Approved policy text: the version in force now, or on `asOf`. Section pages are left
 * out. Purpose and Scope are flagged `intro`: they say what a policy is about, so they
 * rank below sections that say what it requires.
 */
function policyPassages(
  ctx: AskCtx,
  asOf: string | null,
  onlyDocId?: string,
  which: 'all' | 'intro' = 'all',
): Passage[] {
  if (!ctx.can('policies.read') || !hasFeature(ctx.org.tier, 'policies')) return []
  const t = asOf ? endOfDay(ctx, asOf) : null
  const out: Passage[] = []
  for (const doc of ctx.db.documents) {
    if (doc.orgId !== ctx.org.id || !doc.requiresApproval) continue
    if (onlyDocId && doc.id !== onlyDocId) continue
    const version =
      t === null
        ? doc.status === 'retired'
          ? null
          : doc.approvedVersion
        : versionInForce(ctx, doc, t)
    if (!version) continue
    const stored = ctx.db.documentVersions.find(
      (v) => v.documentId === doc.id && v.version === version,
    )
    if (!stored) continue
    for (const s of splitSections(stored.bodyMarkdown)) {
      // Boilerplate sections would match almost any question.
      if (/^\d*\.?\s*(review|related documents|compliance and exceptions)$/i.test(s.heading))
        continue
      const intro = /^\d*\.?\s*(purpose|scope)$/i.test(s.heading)
      if (which === 'intro' && !intro) continue
      for (const text of s.passages)
        out.push({ doc, version, sectionId: s.id, heading: s.heading, text, intro })
    }
  }
  return out
}

function policyHref(ctx: AskCtx, doc: Document, version: number, sectionId: string): string {
  // The read view shows the latest version to editors, so older versions link to their own page.
  const base = `/${ctx.org.slug}/policies/${doc.id}`
  return `${version === doc.currentVersion ? base : `${base}/versions/${version}`}#${sectionId}`
}

export interface PolicyHit {
  docTitle: string
  intro: boolean
  citation: Omit<Citation, 'n'>
  passages: string[]
  score: number
}

/** Best-matching policy sections (up to `limit`), each with its matching passages. */
export function searchPolicies(
  ctx: AskCtx,
  question: string,
  opts: { asOf?: string | null; docId?: string; limit?: number } = {},
): PolicyHit[] {
  const terms = queryTerms(question)
  if (!terms.length) return []
  const needed = Math.max(1, Math.ceil(terms.length * 0.4))
  const scored = policyPassages(ctx, opts.asOf ?? null, opts.docId)
    .map((p) => {
      const inText = matches(terms, stems(p.text))
      const inContext = matches(terms, stems(`${p.heading} ${p.doc.title}`))
      const all = matches(terms, stems(`${p.text} ${p.heading} ${p.doc.title}`))
      return { p, inText, all, score: inText * 3 + inContext - (p.intro ? 3 : 0) }
    })
    .filter((s) => s.inText > 0 && s.all >= needed)
    .sort((a, b) => b.score - a.score)

  const bySection = new Map<string, PolicyHit>()
  for (const { p, score } of scored) {
    const key = `${p.doc.id}#${p.sectionId}`
    const hit = bySection.get(key)
    if (hit) {
      if (hit.passages.length < 2 && score >= hit.score - 1) hit.passages.push(p.text)
      continue
    }
    if (bySection.size >= (opts.limit ?? 3)) continue
    bySection.set(key, {
      docTitle: p.doc.title,
      intro: p.intro,
      score,
      passages: [p.text],
      citation: {
        kind: 'policy_section',
        label: `${p.doc.docId} ${p.doc.title} › ${p.heading}`,
        href: policyHref(ctx, p.doc, p.version, p.sectionId),
        docId: p.doc.docId,
        version: p.version,
        sectionId: p.sectionId,
        excerpt: p.text,
      },
    })
  }
  const hits = [...bySection.values()]
  // When the best match is a policy's purpose ("What to do when patient information is
  // lost"), the answer is that policy's first substantive section: quote both.
  const best = scored[0]?.p
  if (best?.intro && hits[0]?.intro) {
    const body = policyPassages(ctx, opts.asOf ?? null, best.doc.id).filter((p) => !p.intro)
    const first = body[0]
    if (
      first &&
      !hits.some(
        (h) => h.citation.sectionId === first.sectionId && h.citation.docId === best.doc.docId,
      )
    ) {
      hits.splice(1, 0, {
        docTitle: best.doc.title,
        intro: false,
        score: hits[0].score,
        passages: body
          .filter((p) => p.sectionId === first.sectionId)
          .slice(0, 4)
          .map((p) => p.text),
        citation: {
          kind: 'policy_section',
          label: `${best.doc.docId} ${best.doc.title} › ${first.heading}`,
          href: policyHref(ctx, best.doc, first.version, first.sectionId),
          docId: best.doc.docId,
          version: first.version,
          sectionId: first.sectionId,
          excerpt: first.text,
        },
      })
    }
  }
  return hits.slice(0, opts.limit ?? 3)
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

const NOT_FOUND = 'I couldn’t find this in your approved documents.'

function suggestionsFor(ctx: AskCtx, route: AskRoute): string[] {
  if (route === 'records')
    return [
      'Which systems hold personal data?',
      'List our open risks',
      'Which agreements renew this year?',
    ]
  if (route === 'impact')
    return [
      'What does changing ITD-007 affect?',
      'What is affected if the Production database changes?',
    ]
  const titles = new Set(
    ctx.db.documents.filter((d) => d.orgId === ctx.org.id && d.approvedVersion).map((d) => d.docId),
  )
  return [
    titles.has('ITD-007') ? 'What does the Access Control Policy require for MFA?' : null,
    titles.has('ITD-012') ? 'How quickly must we notify the NPC of a breach?' : null,
    titles.has('ITD-008') ? 'Can I paste client data into ChatGPT?' : null,
    titles.has('CLN-001') ? 'Who can see patient records?' : null,
    titles.has('CLN-003') ? 'What do I do if patient information is lost?' : null,
  ]
    .filter((s): s is string => Boolean(s))
    .slice(0, 3)
}

export function notFound(ctx: AskCtx, route: AskRoute): Answer {
  return {
    route,
    content: NOT_FOUND,
    citations: [],
    grounded: false,
    suggestions: suggestionsFor(ctx, route),
  }
}

export function number(hits: Omit<Citation, 'n'>[]): Citation[] {
  return hits.map((c, i) => ({ ...c, n: i + 1 }))
}

/** A policy the question names by ID ("ITD-007") or title ("the Access Control Policy"). */
export function namedDocument(ctx: AskCtx, question: string): string | undefined {
  const q = question.toLowerCase()
  const docs = ctx.db.documents.filter((d) => d.orgId === ctx.org.id && d.requiresApproval)
  const byId = docs.find((d) => new RegExp(`\\b${d.docId.toLowerCase()}\\b`).test(q))
  if (byId) return byId.id
  return docs
    .filter((d) => q.includes(d.title.toLowerCase().replace(/\s+policy$/, '')))
    .sort((a, b) => b.title.length - a.title.length)[0]?.id
}

export function answerFromPolicies(
  ctx: AskCtx,
  question: string,
  opts: { asOf?: string | null; context?: AskContext | null } = {},
): Answer {
  const named = namedDocument(ctx, question)
  const docId = named ?? (opts.context?.type === 'document' ? opts.context.id : undefined)
  // Once the question names a policy, its title words say where to look, not what to look for.
  const namedDoc = ctx.db.documents.find((d) => d.id === named)
  const topic = namedDoc
    ? question
        .replace(new RegExp(namedDoc.docId, 'i'), ' ')
        .replace(new RegExp(namedDoc.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')
        .replace(
          new RegExp(
            namedDoc.title.replace(/\s+policy$/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'i',
          ),
          ' ',
        )
    : question
  const summarise = /\bsummari[sz]e|\bsummary\b|\boverview\b/i.test(question)
  let hits: PolicyHit[] = []
  if (docId && summarise) {
    // "Summarise this policy": its purpose and scope.
    hits = policyPassages(ctx, opts.asOf ?? null, docId, 'intro')
      .slice(0, 2)
      .map((p) => ({
        docTitle: p.doc.title,
        intro: true,
        score: 1,
        passages: [p.text],
        citation: {
          kind: 'policy_section' as const,
          label: `${p.doc.docId} ${p.doc.title} › ${p.heading}`,
          href: policyHref(ctx, p.doc, p.version, p.sectionId),
          docId: p.doc.docId,
          version: p.version,
          sectionId: p.sectionId,
          excerpt: p.text,
        },
      }))
  }
  if (!hits.length && docId) hits = searchPolicies(ctx, topic, { asOf: opts.asOf, docId })
  if (!hits.length) hits = searchPolicies(ctx, question, { asOf: opts.asOf })
  if (!hits.length) return notFound(ctx, 'policy')

  const citations = number(hits.map((h) => h.citation))
  const docs = [...new Set(citations.map((c) => c.docId))]
  const when = opts.asOf ? `As of ${formatCalendarDate(opts.asOf)}, ` : ''
  const intro =
    docs.length === 1
      ? `${when}${when ? 'the' : 'The'} approved ${hits[0]?.docTitle ?? 'policy'} (${docs[0]}, v${citations[0]?.version}) says:`
      : `${when}${when ? 'your' : 'Your'} approved policies say:`
  const lines = hits.flatMap((h, i) => h.passages.map((p) => `- ${sentence(p)} [${i + 1}]`))
  return {
    route: 'policy',
    content: `${intro}\n\n${lines.join('\n')}`,
    citations,
    grounded: true,
    suggestions: [],
  }
}

// ---------------------------------------------------------------------------
// Questionnaire drafting
// ---------------------------------------------------------------------------

/**
 * A draft answer to a client's question, quoting approved policy text with
 * citations, or null when no policy covers it (the row then needs input).
 */
export function draftQuestionnaireAnswer(
  ctx: AskCtx,
  question: string,
): { answer: string; citations: Citation[] } | null {
  let hits = searchPolicies(ctx, question, { limit: 3 })
  // A client wants what the policy requires, not what it is for: prefer the body
  // section that follows a matched Purpose.
  if (hits[0]?.intro && hits[1] && hits[1].citation.docId === hits[0].citation.docId)
    hits = hits.slice(1)
  const first = hits[0]
  if (!first) return null
  const second = hits.find(
    (h) => h.citation.docId !== first.citation.docId && !h.intro && h.score >= first.score - 2,
  )
  const used = second ? [first, second] : [first]
  const citations = number(used.map((h) => h.citation))
  const parts = [
    `Per our ${first.docTitle} (${first.citation.docId}):`,
    ...first.passages.slice(0, 2).map((p) => `${sentence(p)} [1]`),
  ]
  if (second) {
    parts.push(
      `Our ${second.docTitle} (${second.citation.docId}) adds: ${sentence(second.passages[0] ?? '')} [2]`,
    )
  }
  return { answer: parts.join(' '), citations }
}

/** Answer text for the client's file: citation markers removed. */
export function exportableAnswer(text: string): string {
  return text
    .replace(/\s*\[\d+\]/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .trim()
}
