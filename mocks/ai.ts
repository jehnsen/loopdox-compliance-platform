import type {
  AiAssessment,
  AiAssessmentSummary,
  AiEventAction,
  AiProfileConfig,
  AiPromptTestResult,
  AiStats,
  AiTotals,
  AiUseCase,
  AiUseCaseSummary,
} from '@/lib/api/types'
import { ASSESSMENT_QUESTIONS, RECOGNIZERS, suggestedRisk } from '@/lib/ai'
import { addDaysToDate } from '@/lib/privacy'
import { daysUntil, todayInTz } from '@/lib/utils/dates'
import { userName } from '@/mocks/helpers'
import { HttpError, notFound } from '@/mocks/http'
import type { OrgCtx } from '@/mocks/router'

/** Helpers shared by the AI Governance handlers. */

export const orgUseCases = (ctx: OrgCtx): AiUseCase[] =>
  ctx.db.aiUseCases.filter((u) => u.orgId === ctx.org.id)
export const orgAssessments = (ctx: OrgCtx): AiAssessment[] =>
  ctx.db.aiAssessments.filter((a) => a.orgId === ctx.org.id)

export function findUseCase(ctx: OrgCtx, id: string): AiUseCase {
  const u = orgUseCases(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!u) throw notFound('AI use case')
  return u
}

export function findAssessment(ctx: OrgCtx, id: string): AiAssessment {
  const a = orgAssessments(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!a) throw notFound('Assessment')
  return a
}

export function summarizeUseCase(ctx: OrgCtx, u: AiUseCase): AiUseCaseSummary {
  const own = orgAssessments(ctx).filter((a) => a.useCaseId === u.id)
  const decided = own
    .filter((a) => a.status === 'decided' && a.decidedAt && a.decision && a.riskLevel)
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))[0]
  const open = own.find((a) => a.status === 'in_progress')
  return {
    ...u,
    ownerName: userName(ctx.db, u.owner),
    updatedByName: userName(ctx.db, u.updatedBy),
    systemNames: u.systemIds.flatMap((id) => ctx.db.systems.find((s) => s.id === id)?.name ?? []),
    processingRefs: u.processingActivityIds.flatMap((id) => {
      const p = ctx.db.processingActivities.find((x) => x.id === id)
      return p ? [{ id: p.id, ref: p.ref, name: p.name }] : []
    }),
    assessmentState: open ? 'in_progress' : decided ? 'decided' : 'none',
    latestAssessment:
      decided && decided.decision && decided.riskLevel && decided.decidedAt
        ? {
            id: decided.id,
            ref: decided.ref,
            decision: decided.decision,
            riskLevel: decided.riskLevel,
            decidedAt: decided.decidedAt,
            humanOversight: decided.humanOversight,
            conditions: decided.conditions,
          }
        : null,
    openAssessmentId: open?.id ?? null,
  }
}

export function summarizeAssessment(ctx: OrgCtx, a: AiAssessment): AiAssessmentSummary {
  const u = orgUseCases(ctx).find((x) => x.id === a.useCaseId)
  return {
    ...a,
    useCaseRef: u?.ref ?? '',
    useCaseName: u?.name ?? 'Deleted use case',
    decidedByName: a.decidedBy ? userName(ctx.db, a.decidedBy) : null,
    suggestedRisk: suggestedRisk(a.questions),
    answered: a.questions.filter((q) => q.answer).length,
    total: a.questions.length,
  }
}

/** A fresh question set, every question unanswered. */
export function blankQuestions(): AiAssessment['questions'] {
  return ASSESSMENT_QUESTIONS.map((q) => ({ id: q.id, q: q.q, answer: null, note: '' }))
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

const sum = (
  days: {
    calls: number
    piiMasked: number
    blocked: number
    cacheHits: number
    costEstimatePhp: number
  }[],
): AiTotals => ({
  calls: days.reduce((n, d) => n + d.calls, 0),
  piiMasked: days.reduce((n, d) => n + d.piiMasked, 0),
  blocked: days.reduce((n, d) => n + d.blocked, 0),
  cacheHits: days.reduce((n, d) => n + d.cacheHits, 0),
  costEstimatePhp: Math.round(days.reduce((n, d) => n + d.costEstimatePhp, 0) * 100) / 100,
})

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function statsFor(ctx: OrgCtx): AiStats {
  const today = todayInTz(ctx.org.timezone, ctx.now)
  const to = ctx.query.get('to') ?? today
  const from = ctx.query.get('from') ?? addDaysToDate(to, -29)
  for (const [name, v] of [
    ['from', from],
    ['to', to],
  ] as const) {
    if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
      throw new HttpError(400, 'validation_error', `“${name}” must be a date like 2026-10-14.`, {
        [name]: 'Enter a date.',
      })
    }
  }
  if (from > to) {
    throw new HttpError(400, 'validation_error', 'The period ends before it starts.', {
      to: 'Choose a date on or after the start.',
    })
  }
  const length = daysUntil(to, 'UTC', new Date(`${from}T12:00:00Z`)) + 1
  if (length > 90) {
    throw new HttpError(400, 'validation_error', 'Statistics cover at most 90 days at a time.', {
      from: 'Choose a start within 90 days of the end.',
    })
  }
  const own = ctx.db.aiDays.filter((d) => d.orgId === ctx.org.id)
  const inWindow = own
    .filter((d) => d.date >= from && d.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
  const prevTo = addDaysToDate(from, -1)
  const prevFrom = addDaysToDate(prevTo, -(length - 1))
  const earliest = own.reduce((min, d) => (d.date < min ? d.date : min), '9999-12-31')
  const previous =
    prevFrom >= earliest ? sum(own.filter((d) => d.date >= prevFrom && d.date <= prevTo)) : null

  const reasons = new Map<string, number>()
  for (const d of inWindow)
    for (const [r, n] of Object.entries(d.reasons)) reasons.set(r, (reasons.get(r) ?? 0) + n)
  const proxy = ctx.db.aiProxy.find((p) => p.orgId === ctx.org.id)
  return {
    from,
    to,
    status: proxy?.status ?? 'healthy',
    statusNote: proxy?.note ?? '',
    latencyP95Ms: proxy?.latencyP95Ms ?? 0,
    uptimePct: proxy?.uptimePct ?? 100,
    checkedAt: proxy?.checkedAt ?? ctx.now.toISOString(),
    days: inWindow.map(({ orgId: _o, reasons: _r, ...d }) => d),
    totals: sum(inWindow),
    previous,
    topBlocked: [...reasons.entries()]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count })),
  }
}

// ---------------------------------------------------------------------------
// Prompt tester: a plausible stand-in for the proxy's own test endpoint
// ---------------------------------------------------------------------------

const PATTERNS: [id: string, re: RegExp][] = [
  ['PH_PHILSYS', /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g],
  ['PH_TIN', /\b\d{3}-\d{3}-\d{3}(?:-\d{3,5})?\b/g],
  ['PH_PHILHEALTH', /\b\d{2}-\d{9}-\d\b/g],
  ['PH_SSS', /\b\d{2}-\d{7}-\d\b/g],
  ['CREDIT_CARD', /\b(?:\d{4}[ -]){3}\d{4}\b/g],
  ['PH_PHONE', /(?:\+63|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g],
  ['EMAIL', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ['IP_ADDRESS', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  [
    'PERSON_NAME',
    /\b(?:Mr|Mrs|Ms|Dr|Dra|Atty|Engr|Hon)\.?\s+[A-Z][a-z]+(?:\s+(?:de la|dela|del)?\s*[A-Z][a-z]+)?/g,
  ],
]

const SECRET =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})|-----BEGIN [A-Z ]*PRIVATE KEY-----/g
const SECRET_TEST = new RegExp(SECRET.source)
const INJECTION =
  /ignore (?:all |any |the )?(?:previous|prior|above) (?:instructions|rules)|reveal (?:your )?(?:system|hidden) prompt|disregard .{0,30}instructions/i
const BULK =
  /\b(?:list|dump|export|give me)\b.{0,20}\b(?:all|every)\b.{0,25}\b(?:clients?|customers?|patients?|employees?|records?)\b/i

/** What the proxy would do with `prompt` under `config`. Nothing is stored or logged. */
export function testPrompt(prompt: string, config: AiProfileConfig): AiPromptTestResult {
  let masked = prompt
  const counts = new Map<string, number>()
  const note = (type: string, n = 1) => counts.set(type, (counts.get(type) ?? 0) + n)
  const reasons: string[] = []

  if (config.guardrails.includes('secrets') && SECRET_TEST.test(prompt)) {
    reasons.push('Secret or API key in prompt')
  }
  // A key is never forwarded, even when the guardrail is off.
  masked = masked.replace(SECRET, () => {
    note('SECRET')
    return '[SECRET]'
  })
  for (const [id, re] of PATTERNS) {
    if (!config.piiRecognizers.includes(id)) continue
    masked = masked.replace(re, () => {
      note(id)
      return `[${id}]`
    })
  }
  if (config.guardrails.includes('prompt_injection') && INJECTION.test(prompt)) {
    reasons.push('Prompt injection')
  }
  if (config.guardrails.includes('bulk_export') && BULK.test(prompt)) {
    reasons.push('Bulk data request')
  }
  const lower = prompt.toLowerCase()
  for (const topic of config.blockedTopics) {
    if (topic && lower.includes(topic.toLowerCase())) reasons.push(`Blocked topic: ${topic}`)
  }

  const action: AiEventAction = reasons.length ? 'blocked' : counts.size ? 'masked' : 'allowed'
  const label = (type: string) =>
    type === 'SECRET' ? 'Secret or key' : (RECOGNIZERS.find((r) => r.id === type)?.label ?? type)
  return {
    action,
    masked,
    findings: [...counts.entries()].map(([type, count]) => ({ type, label: label(type), count })),
    reasons: [...new Set(reasons)],
  }
}
