import type { Decision, DecisionSummary } from '@/lib/api/types'
import { decisionFormSchema, updateDecisionSchema, versionOnlySchema } from '@/lib/schemas/security'
import { audit } from '@/mocks/audit'
import { baseFields, touch, userName } from '@/mocks/helpers'
import { checkVersion, json, noContent, notFound, paginate, parse } from '@/mocks/http'
import { assertMember, nextRef, unprocessable } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { assertSystem } from '@/mocks/security'
import { commit } from '@/mocks/store'

const opts = { feature: 'security' as const }

function orgDecisions(ctx: OrgCtx): Decision[] {
  return ctx.db.decisions.filter((d) => d.orgId === ctx.org.id)
}

function summarize(ctx: OrgCtx, d: Decision): DecisionSummary {
  const ref = (id: string | null) => (id ? orgDecisions(ctx).find((x) => x.id === id)?.ref : null)
  return {
    ...d,
    decidedByName: userName(ctx.db, d.decidedBy),
    updatedByName: userName(ctx.db, d.updatedBy),
    supersededByRef: ref(d.supersededBy) ?? null,
    supersedesRef: ref(d.supersedes) ?? null,
  }
}

function findStored(ctx: OrgCtx, id: string): Decision {
  const d = orgDecisions(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!d) throw notFound('Decision')
  return d
}

const label = (d: Decision) => `${d.ref} ${d.title}`

function validate(ctx: OrgCtx, input: { decidedBy: string; systemIds: string[] }): void {
  assertMember(ctx, input.decidedBy, 'decidedBy')
  for (const id of input.systemIds) assertSystem(ctx, id, 'systemIds')
}

export const decisionRoutes: RouteDef[] = [
  orgRoute('GET', '/decisions', { ...opts, permission: 'security.read' }, (ctx) => {
    const items = orgDecisions(ctx).map((d) => summarize(ctx, d))
    return json(
      paginate(items, ctx.query, {
        search: (d) => [d.ref, d.title, d.context, d.decision, d.consequences],
        defaultSort: '-ref',
        filters: {
          status: (d, v) => v.includes(d.status),
          system: (d, v) => d.systemIds.some((id) => v.includes(id)),
        },
      }),
    )
  }),

  orgRoute('POST', '/decisions', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const input = parse(decisionFormSchema, await ctx.json())
    validate(ctx, input)
    const d: Decision = {
      ...baseFields(ctx, 'adr'),
      ref: nextRef(
        orgDecisions(ctx).map((x) => x.ref),
        'ADR',
      ),
      ...input,
      supersededBy: null,
      supersedes: null,
    }
    ctx.db.decisions.push(d)
    audit(ctx, 'decision.created', { type: 'decision', id: d.id, label: label(d) })
    commit()
    return json(summarize(ctx, d), 201)
  }),

  orgRoute('GET', '/decisions/:id', { ...opts, permission: 'security.read' }, (ctx) =>
    json(summarize(ctx, findStored(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/decisions/:id', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const { ifVersion, ...input } = parse(updateDecisionSchema, await ctx.json())
    const d = findStored(ctx, ctx.params.id ?? '')
    checkVersion(d, ifVersion)
    if (d.status === 'superseded') {
      throw unprocessable('A superseded decision is a historical record and can’t be edited.')
    }
    validate(ctx, input)
    const accepted = d.status === 'proposed' && input.status === 'accepted'
    Object.assign(d, input)
    touch(ctx, d)
    audit(ctx, accepted ? 'decision.accepted' : 'decision.updated', {
      type: 'decision',
      id: d.id,
      label: label(d),
    })
    commit()
    return json(summarize(ctx, d))
  }),

  // Only proposals can be withdrawn; accepted and superseded decisions are the record.
  orgRoute('DELETE', '/decisions/:id', { ...opts, permission: 'security.edit' }, (ctx) => {
    const d = findStored(ctx, ctx.params.id ?? '')
    if (d.status !== 'proposed') {
      throw unprocessable(
        'Only proposed decisions can be deleted. Supersede an accepted one instead.',
      )
    }
    ctx.db.decisions = ctx.db.decisions.filter((x) => x.id !== d.id)
    audit(ctx, 'decision.deleted', { type: 'decision', id: d.id, label: label(d) })
    commit()
    return noContent()
  }),

  /**
   * Replaces an accepted decision: the body is the new decision. The new one is created
   * as accepted and points back; the old one becomes superseded and points forward.
   */
  orgRoute(
    'POST',
    '/decisions/:id/supersede',
    { ...opts, permission: 'security.edit' },
    async (ctx) => {
      const body = (await ctx.json()) as Record<string, unknown>
      const { ifVersion } = parse(versionOnlySchema, { ifVersion: body.ifVersion })
      const input = parse(decisionFormSchema, { ...body, status: 'accepted' })
      const old = findStored(ctx, ctx.params.id ?? '')
      checkVersion(old, ifVersion)
      if (old.status !== 'accepted') {
        throw unprocessable('Only an accepted decision can be superseded.')
      }
      validate(ctx, input)
      const next: Decision = {
        ...baseFields(ctx, 'adr'),
        ref: nextRef(
          orgDecisions(ctx).map((x) => x.ref),
          'ADR',
        ),
        ...input,
        status: 'accepted',
        supersededBy: null,
        supersedes: old.id,
      }
      ctx.db.decisions.push(next)
      old.status = 'superseded'
      old.supersededBy = next.id
      touch(ctx, old)
      audit(
        ctx,
        'decision.superseded',
        { type: 'decision', id: old.id, label: label(old) },
        {
          by: next.ref,
        },
      )
      audit(
        ctx,
        'decision.created',
        { type: 'decision', id: next.id, label: label(next) },
        {
          supersedes: old.ref,
        },
      )
      commit()
      return json(summarize(ctx, next), 201)
    },
  ),
]
