import type {
  AccessGrant,
  AccessGrantSummary,
  AccessReview,
  AccessReviewSummary,
  EvidenceItem,
  Evidence,
  ReviewDecision,
} from '@/lib/api/types'
import {
  bulkKeepSchema,
  createAccessReviewSchema,
  grantFormSchema,
  reviewDecisionSchema,
  updateGrantSchema,
  versionOnlySchema,
} from '@/lib/schemas/security'
import { ACCESS_LEVEL_LABELS, ACCESS_REVIEW_CONTROL_REFERENCE, periodEnd } from '@/lib/security'
import { audit } from '@/mocks/audit'
import { baseFields, touch, userName } from '@/mocks/helpers'
import { checkVersion, HttpError, json, notFound, paginate, parse } from '@/mocks/http'
import { assertMember, dueState, nextRef, today, unprocessable } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { assertSystem, personKeyOf, personNameOf, systemOf } from '@/mocks/security'
import { commit } from '@/mocks/store'

const opts = { feature: 'security' as const }

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

function orgGrants(ctx: OrgCtx): AccessGrant[] {
  return ctx.db.accessGrants.filter((g) => g.orgId === ctx.org.id)
}

function summarizeGrant(ctx: OrgCtx, g: AccessGrant): AccessGrantSummary {
  const system = systemOf(ctx, g.systemId)
  return {
    ...g,
    systemName: system?.name ?? 'Deleted system',
    systemRef: system?.ref ?? '',
    personName: personNameOf(ctx, g),
    personKey: personKeyOf(g),
    approvedByName: userName(ctx.db, g.approvedBy),
    updatedByName: userName(ctx.db, g.updatedBy),
  }
}

function findGrant(ctx: OrgCtx, id: string): AccessGrant {
  const g = orgGrants(ctx).find((x) => x.id === id)
  if (!g) throw notFound('Access grant')
  return g
}

function grantLabel(ctx: OrgCtx, g: AccessGrant): string {
  const s = systemOf(ctx, g.systemId)
  return `${personNameOf(ctx, g)}: ${ACCESS_LEVEL_LABELS[g.level]} on ${s?.name ?? 'a system'}`
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

function orgReviews(ctx: OrgCtx): AccessReview[] {
  return ctx.db.accessReviews.filter((r) => r.orgId === ctx.org.id)
}

function findReview(ctx: OrgCtx, id: string): AccessReview {
  const r = orgReviews(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!r) throw notFound('Access review')
  return r
}

export function evidenceItem(ctx: OrgCtx, e: Evidence): EvidenceItem {
  const file = e.fileId ? ctx.db.files.find((f) => f.id === e.fileId) : undefined
  let fileRef: EvidenceItem['file'] = null
  if (file) {
    const { orgId: _orgId, ...ref } = file
    fileRef = ref
  }
  return {
    ...e,
    collectedByName: e.createdBy ? userName(ctx.db, e.createdBy) : null,
    file: fileRef,
    originHref:
      e.origin?.type === 'access_review'
        ? `/${ctx.org.slug}/security/access-reviews/${e.origin.id}`
        : null,
  }
}

function summarizeReview(ctx: OrgCtx, r: AccessReview): AccessReviewSummary {
  const counts: Record<ReviewDecision, number> = { keep: 0, revoke: 0, change: 0 }
  for (const i of r.items) if (i.decision) counts[i.decision] += 1
  const due = dueState(ctx, r.dueAt, 14)
  const evidence = r.evidenceId ? ctx.db.evidence.find((e) => e.id === r.evidenceId) : undefined
  return {
    ...r,
    reviewerName: userName(ctx.db, r.reviewer),
    signedOffByName: r.signedOffBy ? userName(ctx.db, r.signedOffBy) : null,
    updatedByName: userName(ctx.db, r.updatedBy),
    systemNames: r.systemIds.map((id) => systemOf(ctx, id)?.name ?? 'Deleted system'),
    decided: r.items.filter((i) => i.decision).length,
    total: r.items.length,
    counts,
    dueState: r.status === 'signed_off' ? null : due.state,
    daysLeft: due.days,
    evidence: evidence ? evidenceItem(ctx, evidence) : null,
  }
}

function reviewLabel(r: AccessReview): string {
  return `${r.ref} Access review ${r.period}`
}

function assertOpen(r: AccessReview): void {
  if (r.status !== 'in_progress') throw unprocessable('This review has been signed off.')
}

export const accessRoutes: RouteDef[] = [
  // -------------------------------------------------------------------------
  // Access grants
  // -------------------------------------------------------------------------
  orgRoute('GET', '/access-grants', { ...opts, permission: 'security.read' }, (ctx) => {
    // Revoked grants stay on record but only show when asked for.
    const status = ctx.query.get('status') ?? 'active'
    const items = orgGrants(ctx)
      .filter((g) => status === 'all' || g.status === status)
      .map((g) => summarizeGrant(ctx, g))
    return json(
      paginate(items, ctx.query, {
        search: (g) => [g.personName, g.systemName, g.systemRef, g.notes],
        defaultSort: 'systemName',
        filters: {
          system: (g, v) => v.includes(g.systemId),
          person: (g, v) => v.includes(g.personKey),
          level: (g, v) => v.includes(g.level),
          external: (g, v) => v.includes(String(g.externalName !== null)),
        },
      }),
    )
  }),

  orgRoute('POST', '/access-grants', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const input = parse(grantFormSchema, await ctx.json())
    assertSystem(ctx, input.systemId, 'systemId')
    if (input.userId) assertMember(ctx, input.userId, 'userId')
    assertMember(ctx, input.approvedBy, 'approvedBy')
    const key = personKeyOf(input)
    const existing = orgGrants(ctx).find(
      (g) => g.status === 'active' && g.systemId === input.systemId && personKeyOf(g) === key,
    )
    if (existing) {
      throw new HttpError(422, 'unprocessable', 'That person already has access to this system.', {
        userId: 'They already have an active grant. Edit it instead.',
      })
    }
    const g: AccessGrant = {
      ...baseFields(ctx, 'grant'),
      ...input,
      externalName: input.userId ? null : input.externalName,
      lastReviewedAt: null,
      status: 'active',
      revokedAt: null,
    }
    ctx.db.accessGrants.push(g)
    audit(ctx, 'access_grant.created', {
      type: 'access_grant',
      id: g.id,
      label: grantLabel(ctx, g),
    })
    commit()
    return json(summarizeGrant(ctx, g), 201)
  }),

  orgRoute('PATCH', '/access-grants/:id', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const { ifVersion, ...input } = parse(updateGrantSchema, await ctx.json())
    const g = findGrant(ctx, ctx.params.id ?? '')
    checkVersion(g, ifVersion)
    if (g.status !== 'active') throw unprocessable('This access was revoked and can’t be edited.')
    if (input.systemId !== g.systemId || personKeyOf(input) !== personKeyOf(g)) {
      throw unprocessable(
        'To move access to another system or person, revoke it and add a new grant.',
      )
    }
    assertMember(ctx, input.approvedBy, 'approvedBy')
    const changedLevel = input.level !== g.level
    Object.assign(g, {
      level: input.level,
      approvedBy: input.approvedBy,
      grantedAt: input.grantedAt,
      notes: input.notes,
    })
    touch(ctx, g)
    audit(
      ctx,
      changedLevel ? 'access_grant.level_changed' : 'access_grant.updated',
      { type: 'access_grant', id: g.id, label: grantLabel(ctx, g) },
      changedLevel ? { level: g.level } : {},
    )
    commit()
    return json(summarizeGrant(ctx, g))
  }),

  orgRoute(
    'POST',
    '/access-grants/:id/revoke',
    { ...opts, permission: 'security.edit' },
    async (ctx) => {
      const { ifVersion } = parse(versionOnlySchema, await ctx.json())
      const g = findGrant(ctx, ctx.params.id ?? '')
      checkVersion(g, ifVersion)
      if (g.status === 'revoked') throw unprocessable('This access is already revoked.')
      g.status = 'revoked'
      g.revokedAt = ctx.now.toISOString()
      touch(ctx, g)
      audit(ctx, 'access_grant.revoked', {
        type: 'access_grant',
        id: g.id,
        label: grantLabel(ctx, g),
      })
      commit()
      return json(summarizeGrant(ctx, g))
    },
  ),

  // -------------------------------------------------------------------------
  // Access reviews
  // -------------------------------------------------------------------------
  orgRoute('GET', '/access-reviews', { ...opts, permission: 'security.read' }, (ctx) =>
    json(
      paginate(
        orgReviews(ctx).map((r) => summarizeReview(ctx, r)),
        ctx.query,
        {
          search: (r) => [r.ref, r.period],
          defaultSort: '-period',
          filters: { status: (r, v) => v.includes(r.status) },
        },
      ),
    ),
  ),

  orgRoute('POST', '/access-reviews', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const input = parse(createAccessReviewSchema, await ctx.json())
    for (const id of input.systemIds) assertSystem(ctx, id, 'systemIds')
    assertMember(ctx, input.reviewer, 'reviewer')
    if (orgReviews(ctx).some((r) => r.period === input.period && r.status === 'in_progress')) {
      throw new HttpError(
        422,
        'unprocessable',
        `A review for ${input.period} is already in progress.`,
        {
          period: 'Finish or sign off the review already open for this period.',
        },
      )
    }
    const grants = orgGrants(ctx).filter(
      (g) => g.status === 'active' && input.systemIds.includes(g.systemId),
    )
    if (!grants.length) {
      throw new HttpError(422, 'unprocessable', 'Those systems have no active access to review.', {
        systemIds: 'Choose systems that have access grants.',
      })
    }
    const review: AccessReview = {
      ...baseFields(ctx, 'ar'),
      ref: nextRef(
        orgReviews(ctx).map((r) => r.ref),
        'AR',
      ),
      period: input.period,
      dueAt: periodEnd(input.period),
      systemIds: input.systemIds,
      reviewer: input.reviewer,
      // Snapshot what each grant is today, so the record stays readable after sign-off changes them.
      items: grants.map((g) => ({
        grantId: g.id,
        systemId: g.systemId,
        systemName: systemOf(ctx, g.systemId)?.name ?? '',
        personName: personNameOf(ctx, g),
        level: g.level,
        decision: null,
        note: '',
        newLevel: null,
        decidedBy: null,
        decidedAt: null,
      })),
      status: 'in_progress',
      signedOffAt: null,
      signedOffBy: null,
      evidenceId: null,
    }
    ctx.db.accessReviews.push(review)
    audit(
      ctx,
      'access_review.created',
      { type: 'access_review', id: review.id, label: reviewLabel(review) },
      { grants: review.items.length },
    )
    commit()
    return json(summarizeReview(ctx, review), 201)
  }),

  orgRoute('GET', '/access-reviews/:id', { ...opts, permission: 'security.read' }, (ctx) =>
    json(summarizeReview(ctx, findReview(ctx, ctx.params.id ?? ''))),
  ),

  // Keep / Revoke / Change one grant. `decision: null` clears it.
  orgRoute(
    'POST',
    '/access-reviews/:id/items/:itemId',
    { ...opts, permission: 'security.edit' },
    async (ctx) => {
      const input = parse(reviewDecisionSchema, await ctx.json())
      const r = findReview(ctx, ctx.params.id ?? '')
      checkVersion(r, input.ifVersion)
      assertOpen(r)
      const item = r.items.find((i) => i.grantId === ctx.params.itemId)
      if (!item) throw notFound('Review item')
      item.decision = input.decision
      item.note = input.decision ? (input.note ?? '').trim() : ''
      item.newLevel = input.decision === 'change' ? (input.newLevel ?? null) : null
      item.decidedBy = input.decision ? ctx.user.id : null
      item.decidedAt = input.decision ? ctx.now.toISOString() : null
      touch(ctx, r)
      commit()
      return json(summarizeReview(ctx, r))
    },
  ),

  orgRoute(
    'POST',
    '/access-reviews/:id/keep-all',
    { ...opts, permission: 'security.edit' },
    async (ctx) => {
      const input = parse(bulkKeepSchema, await ctx.json())
      const r = findReview(ctx, ctx.params.id ?? '')
      checkVersion(r, input.ifVersion)
      assertOpen(r)
      const at = ctx.now.toISOString()
      for (const item of r.items) {
        if (item.decision) continue
        if (input.grantIds && !input.grantIds.includes(item.grantId)) continue
        item.decision = 'keep'
        item.decidedBy = ctx.user.id
        item.decidedAt = at
      }
      touch(ctx, r)
      commit()
      return json(summarizeReview(ctx, r))
    },
  ),

  /**
   * Sign-off applies the decisions (revoked grants end, changed grants get their new
   * level, every reviewed grant is stamped) and records an evidence item against the
   * access control, so the review shows up on that control's timeline.
   */
  orgRoute(
    'POST',
    '/access-reviews/:id/sign-off',
    { ...opts, permission: 'security.edit' },
    async (ctx) => {
      const { ifVersion } = parse(versionOnlySchema, await ctx.json())
      const r = findReview(ctx, ctx.params.id ?? '')
      checkVersion(r, ifVersion)
      assertOpen(r)
      const open = r.items.filter((i) => !i.decision).length
      if (open) {
        throw unprocessable(
          `${open} ${open === 1 ? 'grant has' : 'grants have'} no decision yet. Decide every grant before signing off.`,
        )
      }
      const date = today(ctx)
      const at = ctx.now.toISOString()
      let revoked = 0
      let changed = 0
      for (const item of r.items) {
        const g = orgGrants(ctx).find((x) => x.id === item.grantId)
        // Access that already ended, or never existed here, has nothing to apply.
        if (!g || g.status !== 'active') continue
        if (item.decision === 'revoke') {
          g.status = 'revoked'
          g.revokedAt = at
          revoked += 1
        } else if (item.decision === 'change' && item.newLevel) {
          g.level = item.newLevel
          changed += 1
        }
        g.lastReviewedAt = date
        touch(ctx, g)
      }
      const kept = r.items.filter((i) => i.decision === 'keep').length
      const control = ctx.db.controls.find(
        (c) => c.orgId === ctx.org.id && c.reference === ACCESS_REVIEW_CONTROL_REFERENCE,
      )
      if (control) {
        const evidence: Evidence = {
          ...baseFields(ctx, 'evd'),
          controlId: control.id,
          source: 'manual',
          connectorId: null,
          collectedAt: at,
          result: 'pass',
          summary: `Access review ${r.period} signed off: ${r.items.length} grants on ${r.systemIds.length} ${r.systemIds.length === 1 ? 'system' : 'systems'} reviewed, ${kept} kept, ${revoked} revoked, ${changed} changed.`,
          fileId: null,
          origin: { type: 'access_review', id: r.id, label: reviewLabel(r) },
        }
        ctx.db.evidence.push(evidence)
        r.evidenceId = evidence.id
      }
      r.status = 'signed_off'
      r.signedOffAt = at
      r.signedOffBy = ctx.user.id
      touch(ctx, r)
      audit(
        ctx,
        'access_review.signed_off',
        { type: 'access_review', id: r.id, label: reviewLabel(r) },
        { period: r.period, kept, revoked, changed },
      )
      commit()
      return json(summarizeReview(ctx, r))
    },
  ),
]
