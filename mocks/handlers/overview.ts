import type {
  ActivityItem,
  AttentionItem,
  AttentionKind,
  ControlCoverage,
  DocumentCounts,
  Framework,
  OverviewResponse,
  RecordType,
} from '@/lib/api/types'
import { isAuditorOnly } from '@/lib/auth/permissions'
import { hasFeature } from '@/lib/entitlements'
import { recordHref } from '@/lib/links'
import { ATTENTION_ORDER, dueInPhrase } from '@/lib/overview'
import { DSR_DUE_SOON_DAYS, DSR_TYPE_LABELS, RENEWAL_LEAD_DAYS } from '@/lib/privacy'
import { daysUntil } from '@/lib/utils/dates'
import { reviewStateOf, visibleDocs } from '@/mocks/handlers/documents'
import { userName } from '@/mocks/helpers'
import { json } from '@/mocks/http'
import { canSeePrivacy, dueState } from '@/mocks/privacy'
import { visibleRecords } from '@/mocks/records'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'

/**
 * One source of "Needs attention" items. Each module registers its own as its
 * records arrive (security in M5, evidence in M6), the way search sources do.
 * `urgency` orders items of the same kind and tone: smaller is more urgent.
 */
export interface AttentionCandidate {
  item: AttentionItem
  urgency: number
}
export type AttentionSource = (ctx: OrgCtx) => AttentionCandidate[]

export const attentionSources: AttentionSource[] = []

const HOUR = 3_600_000
// Same threshold as the CountdownClock: red under 6 hours and after the deadline.
const BREACH_BAD_MS = 6 * HOUR

const inOrg = <T extends { orgId: string }>(ctx: OrgCtx, items: T[]) =>
  items.filter((i) => i.orgId === ctx.org.id)

// Open breaches: personal data involved, NPC not yet notified, notification not ruled out.
attentionSources.push((ctx) => {
  if (!hasFeature(ctx.org.tier, 'privacy') || !ctx.can('privacy.read')) return []
  return inOrg(ctx, ctx.db.incidents).flatMap((i) => {
    const deadline = i.notificationDeadline
    const open =
      i.status !== 'closed' &&
      i.personalDataInvolved &&
      !i.npcNotifiedAt &&
      i.notificationRequired !== false
    if (!deadline || !open) return []
    const remaining = Date.parse(deadline) - ctx.now.getTime()
    return [
      {
        urgency: remaining,
        item: {
          id: `breach_deadline:${i.id}`,
          kind: 'breach_deadline' as const,
          tone: remaining < BREACH_BAD_MS ? ('bad' as const) : ('warn' as const),
          ref: i.ref,
          title: i.title,
          detail:
            i.notificationRequired === null
              ? 'Decide whether NPC notification is required'
              : 'Record the NPC notification',
          badge: null,
          deadline,
          href: recordHref(ctx.org.slug, 'incident', i.id),
        },
      },
    ]
  })
})

// Data subject requests that are open and due within a week, or already late.
attentionSources.push((ctx) => {
  if (!hasFeature(ctx.org.tier, 'privacy') || !ctx.can('privacy.read')) return []
  return inOrg(ctx, ctx.db.dsrs)
    .filter((d) => ['received', 'identity_verified', 'in_progress'].includes(d.status))
    .flatMap((d) => {
      const due = dueState(ctx, d.dueAt, DSR_DUE_SOON_DAYS)
      if (due.state === 'ok') return []
      return [
        {
          urgency: due.days,
          item: {
            id: `dsr_due:${d.id}`,
            kind: 'dsr_due' as const,
            tone: due.state === 'overdue' ? ('bad' as const) : ('warn' as const),
            ref: d.ref,
            title: `${DSR_TYPE_LABELS[d.type]} request`,
            detail: dueInPhrase(due.days),
            badge: d.assignee === ctx.user.id ? 'Assigned to you' : null,
            deadline: null,
            href: recordHref(ctx.org.slug, 'dsr', d.id),
          },
        },
      ]
    })
})

// Policies waiting for a decision. Approvers are told it's theirs.
attentionSources.push((ctx) => {
  if (!hasFeature(ctx.org.tier, 'policies') || !ctx.can('policies.read_drafts')) return []
  const decides = ctx.can('policies.approve')
  return inOrg(ctx, ctx.db.documents)
    .filter((d) => d.status === 'in_review')
    .map((d) => {
      const submitted = ctx.db.workflowEvents
        .filter((e) => e.documentId === d.id && e.type === 'submit')
        .sort((a, b) => b.at.localeCompare(a.at))[0]
      return {
        urgency: submitted ? Date.parse(submitted.at) : 0,
        item: {
          id: `policy_approval:${d.id}`,
          kind: 'policy_approval' as const,
          tone: 'warn' as const,
          ref: d.docId,
          title: d.title,
          detail: submitted
            ? `v${submitted.version} submitted by ${userName(ctx.db, submitted.actor)}`
            : `v${d.currentVersion} submitted for approval`,
          badge: decides ? 'Ready for your decision' : 'Waiting for approval',
          deadline: null,
          href: recordHref(ctx.org.slug, 'document', d.id),
        },
      }
    })
})

// Approved policies past their review date.
attentionSources.push((ctx) => {
  if (!hasFeature(ctx.org.tier, 'policies') || !ctx.can('policies.read_drafts')) return []
  return inOrg(ctx, ctx.db.documents).flatMap((d) => {
    if (!d.nextReviewDate || reviewStateOf(ctx, d) !== 'overdue') return []
    const days = daysUntil(d.nextReviewDate, ctx.org.timezone, ctx.now)
    const late = Math.abs(days)
    return [
      {
        urgency: days,
        item: {
          id: `review_overdue:${d.id}`,
          kind: 'review_overdue' as const,
          tone: 'bad' as const,
          ref: d.docId,
          title: d.title,
          detail: `Review overdue by ${late} ${late === 1 ? 'day' : 'days'}`,
          badge: d.owner === ctx.user.id ? 'You own this' : null,
          deadline: null,
          href: recordHref(ctx.org.slug, 'document', d.id),
        },
      },
    ]
  })
})

// Agreements renewing within 30 days, or past their renewal date.
attentionSources.push((ctx) => {
  if (!hasFeature(ctx.org.tier, 'privacy') || !canSeePrivacy(ctx, true)) return []
  return inOrg(ctx, ctx.db.agreements).flatMap((a) => {
    if (!a.renewsAt) return []
    const due = dueState(ctx, a.renewsAt, RENEWAL_LEAD_DAYS)
    if (due.state === 'ok') return []
    const late = Math.abs(due.days)
    return [
      {
        urgency: due.days,
        item: {
          id: `agreement_renewal:${a.id}`,
          kind: 'agreement_renewal' as const,
          tone: due.state === 'overdue' ? ('bad' as const) : ('warn' as const),
          ref: a.ref,
          title: a.counterparty,
          detail:
            due.days < 0
              ? `Renewal overdue by ${late} ${late === 1 ? 'day' : 'days'}`
              : dueInPhrase(due.days, 'Renews'),
          badge: null,
          deadline: null,
          href: recordHref(ctx.org.slug, 'agreement', a.id),
        },
      },
    ]
  })
})

// Secrets past their rotation date. The record says where the secret lives, never its value.
attentionSources.push((ctx) => {
  if (!hasFeature(ctx.org.tier, 'security') || !ctx.can('security.read')) return []
  return inOrg(ctx, ctx.db.secrets).flatMap((x) => {
    const days = daysUntil(x.nextDueAt, ctx.org.timezone, ctx.now)
    if (days >= 0) return []
    const late = Math.abs(days)
    return [
      {
        urgency: days,
        item: {
          id: `secret_rotation:${x.id}`,
          kind: 'secret_rotation' as const,
          tone: 'bad' as const,
          ref: x.ref,
          title: x.name,
          detail: `Rotation overdue by ${late} ${late === 1 ? 'day' : 'days'}`,
          badge: x.owner === ctx.user.id ? 'You own this' : null,
          deadline: null,
          href: `/${ctx.org.slug}/security/secrets?q=${x.ref}`,
        },
      },
    ]
  })
})

// Access reviews that are open: the quarter's review is work to finish before the period ends.
attentionSources.push((ctx) => {
  if (!hasFeature(ctx.org.tier, 'security') || !ctx.can('security.read')) return []
  return inOrg(ctx, ctx.db.accessReviews)
    .filter((r) => r.status === 'in_progress')
    .map((r) => {
      const days = daysUntil(r.dueAt, ctx.org.timezone, ctx.now)
      const decided = r.items.filter((i) => i.decision).length
      return {
        urgency: days,
        item: {
          id: `access_review:${r.id}`,
          kind: 'access_review' as const,
          tone: days < 0 ? ('bad' as const) : ('warn' as const),
          ref: r.ref,
          title: `Access review ${r.period}`,
          detail: `${decided} of ${r.items.length} decided · ${
            days < 0 ? dueInPhrase(days) : dueInPhrase(days, 'Due')
          }`,
          badge: r.reviewer === ctx.user.id ? 'You’re the reviewer' : null,
          deadline: null,
          href: `/${ctx.org.slug}/security/access-reviews/${r.id}`,
        },
      }
    })
})

/**
 * Ranked by risk class first (breaches, then requests, approvals… as in
 * ATTENTION_ORDER), then overdue before upcoming, then by how soon.
 */
export function rankAttention(candidates: AttentionCandidate[]): AttentionItem[] {
  const toneRank = { bad: 0, warn: 1 }
  const kindRank = (k: AttentionKind) => ATTENTION_ORDER.indexOf(k)
  return [...candidates]
    .sort(
      (a, b) =>
        kindRank(a.item.kind) - kindRank(b.item.kind) ||
        toneRank[a.item.tone] - toneRank[b.item.tone] ||
        a.urgency - b.urgency ||
        a.item.id.localeCompare(b.item.id),
    )
    .map((c) => c.item)
}

/** Staff and auditor guests get no operational list: they have nothing to act on. */
function isOperational(ctx: OrgCtx): boolean {
  return !isAuditorOnly({ roles: ctx.roles }) && !ctx.roles.every((r) => r === 'staff')
}

function documentCounts(ctx: OrgCtx): DocumentCounts | null {
  if (!hasFeature(ctx.org.tier, 'policies') || !ctx.can('policies.read')) return null
  const counts: DocumentCounts = { total: 0, approved: 0, in_review: 0, draft: 0, retired: 0 }
  // Section pages (SEC-001…) organise the library; they aren't controlled documents.
  for (const d of visibleDocs(ctx).filter((x) => !x.docId.startsWith('SEC-'))) {
    counts.total += 1
    counts[d.status] += 1
  }
  return counts
}

const FRAMEWORKS: readonly Framework[] = ['ISO27001:2022', 'DPA', 'NPC', 'internal']

function controlCoverage(ctx: OrgCtx): ControlCoverage[] | null {
  if (!hasFeature(ctx.org.tier, 'evidence') || !ctx.can('evidence.read')) return null
  const controls = inOrg(ctx, ctx.db.controls).filter((c) => c.status !== 'not_applicable')
  return FRAMEWORKS.flatMap((framework) => {
    const own = controls.filter((c) => c.framework === framework)
    if (!own.length) return []
    return [
      {
        framework,
        passing: own.filter((c) => c.status === 'passing').length,
        failing: own.filter((c) => c.status === 'failing').length,
        no_evidence: own.filter((c) => c.status === 'no_evidence').length,
        total: own.length,
      },
    ]
  })
}

const RECORD_TYPES: readonly RecordType[] = [
  'document',
  'processing_activity',
  'pia',
  'dsr',
  'incident',
  'agreement',
  'system',
  'risk',
  'secret_record',
  'change',
  'decision',
]
const SECURITY_PAGES: Record<string, string> = {
  access_review: 'security/access-reviews',
}
const PRIVACY_PAGES: Record<string, string> = {
  registration: 'privacy/registration',
  training_record: 'privacy/training',
}

/** Latest changes to records the caller can open. Admins also see org-level events. */
function recentActivity(ctx: OrgCtx, limit: number): ActivityItem[] {
  const isAdmin = ctx.can('audit_log.read')
  const visible = new Set<string>()
  for (const type of RECORD_TYPES) {
    for (const r of visibleRecords(ctx, type)) visible.add(`${type}:${r.id}`)
  }
  const canSeePrivacyPages = hasFeature(ctx.org.tier, 'privacy') && ctx.can('privacy.read')
  const canSeeSecurity = hasFeature(ctx.org.tier, 'security') && ctx.can('security.read')
  const events: ActivityItem[] = []
  const sorted = inOrg(ctx, ctx.db.auditEvents).sort((a, b) => b.at.localeCompare(a.at))
  for (const e of sorted) {
    if (events.length >= limit) break
    // A reveal names a field of a masked record: for people who manage the log only.
    if (e.action.startsWith('sensitive.') && !isAdmin) continue
    const page = PRIVACY_PAGES[e.targetType]
    const securityPage = SECURITY_PAGES[e.targetType]
    const href = visible.has(`${e.targetType}:${e.targetId}`)
      ? recordHref(ctx.org.slug, e.targetType as RecordType, e.targetId)
      : page && canSeePrivacyPages
        ? `/${ctx.org.slug}/${page}`
        : securityPage && canSeeSecurity
          ? `/${ctx.org.slug}/${securityPage}/${e.targetId}`
          : null
    if (!href && !isAdmin) continue
    events.push({
      id: e.id,
      actor: e.actor,
      action: e.action,
      targetType: e.targetType,
      targetLabel: e.targetLabel,
      href,
      at: e.at,
      details: e.details,
    })
  }
  return events
}

export const overviewRoutes: RouteDef[] = [
  orgRoute('GET', '/overview', {}, (ctx) => {
    const operational = isOperational(ctx)
    const items = operational ? rankAttention(attentionSources.flatMap((s) => s(ctx))) : []
    const counts: OverviewResponse['attention']['counts'] = {}
    for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1
    const body: OverviewResponse = {
      generatedAt: ctx.now.toISOString(),
      documents: documentCounts(ctx),
      attention: { total: items.length, counts, items },
      controlCoverage: controlCoverage(ctx),
      recentActivity: operational ? recentActivity(ctx, 10) : null,
    }
    return json(body)
  }),
]
