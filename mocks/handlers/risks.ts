import type { Risk, RiskSummary } from '@/lib/api/types'
import { scoreBand } from '@/lib/risk'
import { createRiskRequestSchema, updateRiskSchema } from '@/lib/schemas/security'
import { dueStateFor, RISK_REVIEW_LEAD_DAYS } from '@/lib/security'
import { addMonthsToDate } from '@/lib/utils/dates'
import { audit } from '@/mocks/audit'
import { baseFields, touch, userName } from '@/mocks/helpers'
import {
  checkVersion,
  forbidden,
  HttpError,
  json,
  noContent,
  notFound,
  paginate,
  parse,
} from '@/mocks/http'
import { assertMember, canSeePrivacy, nextRef, today } from '@/mocks/privacy'
import { visibleRecords } from '@/mocks/records'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit } from '@/mocks/store'

const opts = { feature: 'security' as const }

function orgRisks(ctx: OrgCtx): Risk[] {
  return ctx.db.risks.filter((r) => r.orgId === ctx.org.id)
}

function summarize(ctx: OrgCtx, r: Risk): RiskSummary {
  const due =
    r.status === 'open'
      ? dueStateFor(r.reviewAt, RISK_REVIEW_LEAD_DAYS, ctx.org.timezone, ctx.now)
      : null
  return {
    ...r,
    ownerName: userName(ctx.db, r.owner),
    updatedByName: userName(ctx.db, r.updatedBy),
    reviewState: due && due.state !== 'ok' ? due.state : null,
    daysToReview: due?.days ?? null,
  }
}

function findStored(ctx: OrgCtx, id: string): Risk {
  const r = orgRisks(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!r) throw notFound('Risk')
  return r
}

const label = (r: Risk) => `${r.ref} ${r.title}`

/** Linked policies must be ones the caller can read, linked controls must exist in the org. */
function assertLinks(ctx: OrgCtx, documentIds: string[], controlIds: string[]): void {
  const docs = new Set(visibleRecords(ctx, 'document').map((d) => d.id))
  if (documentIds.some((id) => !docs.has(id))) {
    throw new HttpError(400, 'validation_error', 'Some fields need attention.', {
      documentIds: 'One of those policies doesn’t exist.',
    })
  }
  const controls = new Set(ctx.db.controls.filter((c) => c.orgId === ctx.org.id).map((c) => c.id))
  if (controlIds.some((id) => !controls.has(id))) {
    throw new HttpError(400, 'validation_error', 'Some fields need attention.', {
      controlIds: 'One of those controls doesn’t exist.',
    })
  }
}

/** Residual score is derived from the two residual ratings. */
function withResidual<
  T extends { residualLikelihood: number | null; residualImpact: number | null },
>(v: T): T & { residualScore: number | null } {
  return {
    ...v,
    residualScore:
      v.residualLikelihood !== null && v.residualImpact !== null
        ? v.residualLikelihood * v.residualImpact
        : null,
  }
}

export const riskRoutes: RouteDef[] = [
  orgRoute('GET', '/risks', { ...opts, permission: 'security.read' }, (ctx) => {
    // `basis` picks which rating the heat map filters on: the inherent one or the residual one.
    const residual = ctx.query.get('basis') === 'residual'
    const basis = (r: Risk) =>
      residual
        ? { l: r.residualLikelihood, i: r.residualImpact, score: r.residualScore }
        : { l: r.likelihood, i: r.impact, score: r.inherentScore }
    const items = orgRisks(ctx).map((r) => summarize(ctx, r))
    return json(
      paginate(items, ctx.query, {
        search: (r) => [r.ref, r.title, r.description, r.ownerName],
        defaultSort: '-inherentScore',
        filters: {
          status: (r, v) => v.includes(r.status),
          treatment: (r, v) => v.includes(r.treatment),
          review: (r, v) => v.includes(r.reviewState ?? 'ok'),
          // "3x5" = likelihood 3, impact 5.
          cell: (r, v) => {
            const b = basis(r)
            return b.l !== null && b.i !== null && v.includes(`${b.l}x${b.i}`)
          },
          band: (r, v) => {
            const { score } = basis(r)
            return score !== null && v.includes(scoreBand(score))
          },
        },
      }),
    )
  }),

  // The full register form, or the short form a post-incident review uses.
  orgRoute('POST', '/risks', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const { incidentId, reviewAt, ...input } = parse(createRiskRequestSchema, await ctx.json())
    assertMember(ctx, input.owner, 'owner')
    assertLinks(ctx, input.documentIds, input.controlIds)
    const incident = incidentId
      ? ctx.db.incidents.find((i) => i.orgId === ctx.org.id && i.id === incidentId)
      : undefined
    if (incidentId) {
      if (!incident || !canSeePrivacy(ctx, incident.status === 'closed')) throw notFound('Incident')
      if (!ctx.can('privacy.edit')) throw forbidden()
    }
    const risk: Risk = {
      ...baseFields(ctx, 'risk'),
      ref: nextRef(
        orgRisks(ctx).map((r) => r.ref),
        'RISK',
      ),
      ...withResidual(input),
      inherentScore: input.likelihood * input.impact,
      reviewAt: reviewAt ?? addMonthsToDate(today(ctx), 3),
    }
    ctx.db.risks.push(risk)
    audit(
      ctx,
      'risk.created',
      { type: 'risk', id: risk.id, label: label(risk) },
      incident ? { incident: incident.ref } : {},
    )
    if (incident) {
      incident.riskIds.push(risk.id)
      touch(ctx, incident)
      audit(
        ctx,
        'incident.linked',
        { type: 'incident', id: incident.id, label: `${incident.ref} ${incident.title}` },
        { type: 'risk', id: risk.id, ref: risk.ref, title: risk.title },
      )
    }
    commit()
    return json(summarize(ctx, risk), 201)
  }),

  orgRoute('GET', '/risks/:id', { ...opts, permission: 'security.read' }, (ctx) =>
    json(summarize(ctx, findStored(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/risks/:id', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const { ifVersion, ...input } = parse(updateRiskSchema, await ctx.json())
    const r = findStored(ctx, ctx.params.id ?? '')
    checkVersion(r, ifVersion)
    assertMember(ctx, input.owner, 'owner')
    assertLinks(ctx, input.documentIds, input.controlIds)
    const closed = r.status === 'open' && input.status === 'closed'
    Object.assign(r, withResidual(input), { inherentScore: input.likelihood * input.impact })
    touch(ctx, r)
    audit(ctx, closed ? 'risk.closed' : 'risk.updated', {
      type: 'risk',
      id: r.id,
      label: label(r),
    })
    commit()
    return json(summarize(ctx, r))
  }),

  orgRoute('DELETE', '/risks/:id', { ...opts, permission: 'security.edit' }, (ctx) => {
    const r = findStored(ctx, ctx.params.id ?? '')
    // Incidents hold the link; drop it so they don't point at a risk that no longer exists.
    for (const i of ctx.db.incidents) {
      if (i.orgId === ctx.org.id && i.riskIds.includes(r.id)) {
        i.riskIds = i.riskIds.filter((x) => x !== r.id)
        touch(ctx, i)
      }
    }
    ctx.db.risks = ctx.db.risks.filter((x) => x.id !== r.id)
    audit(ctx, 'risk.deleted', { type: 'risk', id: r.id, label: label(r) })
    commit()
    return noContent()
  }),
]
