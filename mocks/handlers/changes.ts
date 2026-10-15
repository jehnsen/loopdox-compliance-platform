import type { Change, ChangeReviewState, ChangeSummary } from '@/lib/api/types'
import { changeFormSchema, changeReviewSchema, updateChangeSchema } from '@/lib/schemas/security'
import { EMERGENCY_REVIEW_HOURS } from '@/lib/security'
import { audit } from '@/mocks/audit'
import { baseFields, touch, userName } from '@/mocks/helpers'
import { checkVersion, HttpError, json, notFound, paginate, parse } from '@/mocks/http'
import { assertMember, nextRef, unprocessable } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { assertSystem, systemOf } from '@/mocks/security'
import { commit } from '@/mocks/store'

const opts = { feature: 'security' as const }
const HOUR = 3_600_000

function orgChanges(ctx: OrgCtx): Change[] {
  return ctx.db.changes.filter((c) => c.orgId === ctx.org.id)
}

/** Emergency changes need a review note within 48 hours of deployment. */
export function reviewStateOf(c: Change, now: Date): ChangeReviewState {
  if (!c.emergency) return 'not_required'
  if (c.reviewNote) return 'done'
  return now.getTime() > Date.parse(c.deployedAt) + EMERGENCY_REVIEW_HOURS * HOUR
    ? 'overdue'
    : 'pending'
}

function summarize(ctx: OrgCtx, c: Change): ChangeSummary {
  return {
    ...c,
    systemName: systemOf(ctx, c.systemId)?.name ?? 'Deleted system',
    approverName: c.approver ? userName(ctx.db, c.approver) : null,
    updatedByName: userName(ctx.db, c.updatedBy),
    reviewedByName: c.reviewedBy ? userName(ctx.db, c.reviewedBy) : null,
    reviewState: reviewStateOf(c, ctx.now),
    reviewDueAt: c.emergency
      ? new Date(Date.parse(c.deployedAt) + EMERGENCY_REVIEW_HOURS * HOUR).toISOString()
      : null,
  }
}

function findStored(ctx: OrgCtx, id: string): Change {
  const c = orgChanges(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!c) throw notFound('Change')
  return c
}

const label = (c: Change) => `${c.ref} ${c.summary}`

function assertNotFuture(ctx: OrgCtx, iso: string): void {
  if (Date.parse(iso) > ctx.now.getTime() + 5 * 60_000) {
    throw new HttpError(400, 'validation_error', 'Some fields need attention.', {
      deployedAt: 'The deployment time can’t be in the future.',
    })
  }
}

export const changeRoutes: RouteDef[] = [
  orgRoute('GET', '/changes', { ...opts, permission: 'security.read' }, (ctx) => {
    const items = orgChanges(ctx).map((c) => summarize(ctx, c))
    return json(
      paginate(items, ctx.query, {
        search: (c) => [c.ref, c.summary, c.systemName, c.approverName],
        defaultSort: '-deployedAt',
        filters: {
          source: (c, v) => v.includes(c.source),
          system: (c, v) => v.includes(c.systemId),
          emergency: (c, v) => v.includes(String(c.emergency)),
          review: (c, v) => v.includes(c.reviewState),
        },
      }),
    )
  }),

  orgRoute('POST', '/changes', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const input = parse(changeFormSchema, await ctx.json())
    assertSystem(ctx, input.systemId, 'systemId')
    if (input.approver) assertMember(ctx, input.approver, 'approver')
    assertNotFuture(ctx, input.deployedAt)
    const c: Change = {
      ...baseFields(ctx, 'chg'),
      ref: nextRef(
        orgChanges(ctx).map((x) => x.ref),
        'CHG',
      ),
      ...input,
      externalUrl: input.externalUrl || null,
      deployedAt: new Date(input.deployedAt).toISOString(),
      reviewNote: null,
      reviewedAt: null,
      reviewedBy: null,
    }
    ctx.db.changes.push(c)
    audit(
      ctx,
      'change.logged',
      { type: 'change', id: c.id, label: label(c) },
      { emergency: c.emergency },
    )
    commit()
    return json(summarize(ctx, c), 201)
  }),

  orgRoute('GET', '/changes/:id', { ...opts, permission: 'security.read' }, (ctx) =>
    json(summarize(ctx, findStored(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/changes/:id', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const { ifVersion, ...input } = parse(updateChangeSchema, await ctx.json())
    const c = findStored(ctx, ctx.params.id ?? '')
    checkVersion(c, ifVersion)
    assertSystem(ctx, input.systemId, 'systemId')
    if (input.approver) assertMember(ctx, input.approver, 'approver')
    assertNotFuture(ctx, input.deployedAt)
    Object.assign(c, input, {
      externalUrl: input.externalUrl || null,
      deployedAt: new Date(input.deployedAt).toISOString(),
    })
    touch(ctx, c)
    audit(ctx, 'change.updated', { type: 'change', id: c.id, label: label(c) })
    commit()
    return json(summarize(ctx, c))
  }),

  // The after-the-fact review an emergency change owes within 48 hours.
  orgRoute('POST', '/changes/:id/review', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const { ifVersion, note } = parse(changeReviewSchema, await ctx.json())
    const c = findStored(ctx, ctx.params.id ?? '')
    checkVersion(c, ifVersion)
    if (!c.emergency) throw unprocessable('Only emergency changes need a review note.')
    if (c.reviewNote) throw unprocessable('This change has already been reviewed.')
    c.reviewNote = note
    c.reviewedAt = ctx.now.toISOString()
    c.reviewedBy = ctx.user.id
    touch(ctx, c)
    audit(
      ctx,
      'change.reviewed',
      { type: 'change', id: c.id, label: label(c) },
      { late: Date.parse(c.reviewedAt) > Date.parse(c.deployedAt) + EMERGENCY_REVIEW_HOURS * HOUR },
    )
    commit()
    return json(summarize(ctx, c))
  }),
]
