import type { Pia, PiaStep, PiaSummary } from '@/lib/api/types'
import { PIA_DECISION_LABELS } from '@/lib/privacy'
import { overallScore } from '@/lib/risk'
import { createPiaSchema, signOffPiaSchema, updatePiaSchema } from '@/lib/schemas/privacy'
import { audit } from '@/mocks/audit'
import { baseFields, notify, touch, userName } from '@/mocks/helpers'
import { checkVersion, HttpError, json, noContent, notFound, paginate, parse } from '@/mocks/http'
import { canSeePrivacy, nextRef, unprocessable } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit } from '@/mocks/store'

const opts = { feature: 'privacy' as const }

function orgPias(ctx: OrgCtx): Pia[] {
  return ctx.db.pias.filter((p) => p.orgId === ctx.org.id)
}

function summarize(ctx: OrgCtx, p: Pia): PiaSummary {
  const pa = ctx.db.processingActivities.find((a) => a.id === p.processingActivityId)
  return {
    ...p,
    processingActivityRef: pa?.ref ?? null,
    processingActivityName: pa?.name ?? null,
    signedOffByName: p.signedOffBy ? userName(ctx.db, p.signedOffBy) : null,
    updatedByName: userName(ctx.db, p.updatedBy),
  }
}

function findStored(ctx: OrgCtx, id: string): Pia {
  const p = orgPias(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!p || !canSeePrivacy(ctx, p.status === 'signed_off')) throw notFound('Impact assessment')
  return p
}

function assertActivity(ctx: OrgCtx, id: string): void {
  const exists = ctx.db.processingActivities.some((a) => a.orgId === ctx.org.id && a.id === id)
  if (!exists) {
    throw new HttpError(400, 'validation_error', 'Choose an existing processing record.', {
      processingActivityId: 'Choose an existing processing record.',
    })
  }
}

function label(ctx: OrgCtx, p: Pia): string {
  const pa = ctx.db.processingActivities.find((a) => a.id === p.processingActivityId)
  return `${p.ref}${pa ? ` ${pa.name}` : ''}`
}

const maxStep = (a: PiaStep, b: PiaStep | undefined): PiaStep => (b && b > a ? b : a)

export const piaRoutes: RouteDef[] = [
  orgRoute('GET', '/pias', { ...opts, permission: 'privacy.read' }, (ctx) => {
    const items = orgPias(ctx)
      .filter((p) => canSeePrivacy(ctx, p.status === 'signed_off'))
      .map((p) => summarize(ctx, p))
    return json(
      paginate(items, ctx.query, {
        search: (p) => [p.ref, p.processingActivityName, p.processingActivityRef, p.scope],
        defaultSort: '-updatedAt',
        filters: {
          status: (p, v) => v.includes(p.status),
          decision: (p, v) => v.includes(p.decision ?? 'none'),
          processingActivityId: (p, v) => v.includes(p.processingActivityId),
        },
      }),
    )
  }),

  orgRoute('POST', '/pias', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const input = parse(createPiaSchema, await ctx.json())
    assertActivity(ctx, input.processingActivityId)
    const p: Pia = {
      ...baseFields(ctx, 'pia'),
      ref: nextRef(
        orgPias(ctx).map((x) => x.ref),
        'PIA',
      ),
      processingActivityId: input.processingActivityId,
      scope: input.scope,
      dataFlows: { collection: '', use: '', storage: '', sharing: '', disposal: '' },
      risks: [],
      overallScore: null,
      decision: null,
      conditions: null,
      signedOffBy: null,
      signedOffAt: null,
      status: 'in_progress',
      currentStep: 2,
    }
    ctx.db.pias.push(p)
    audit(ctx, 'pia.created', { type: 'pia', id: p.id, label: label(ctx, p) })
    commit()
    return json(summarize(ctx, p), 201)
  }),

  orgRoute('GET', '/pias/:id', { ...opts, permission: 'privacy.read' }, (ctx) =>
    json(summarize(ctx, findStored(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/pias/:id', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const input = parse(updatePiaSchema, await ctx.json())
    const p = findStored(ctx, ctx.params.id ?? '')
    checkVersion(p, input.ifVersion)
    if (p.status === 'signed_off')
      throw unprocessable('This assessment is signed off and can’t be changed.')
    if (input.processingActivityId !== undefined) {
      assertActivity(ctx, input.processingActivityId)
      p.processingActivityId = input.processingActivityId
    }
    if (input.scope !== undefined) p.scope = input.scope
    if (input.dataFlows !== undefined) p.dataFlows = input.dataFlows
    if (input.risks !== undefined) {
      p.risks = input.risks
      p.overallScore = overallScore(p.risks)
    }
    p.currentStep = maxStep(p.currentStep, input.currentStep)
    touch(ctx, p)
    audit(
      ctx,
      'pia.updated',
      { type: 'pia', id: p.id, label: label(ctx, p) },
      { step: p.currentStep },
    )
    commit()
    return json(summarize(ctx, p))
  }),

  orgRoute('POST', '/pias/:id/sign-off', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const input = parse(signOffPiaSchema, await ctx.json())
    const p = findStored(ctx, ctx.params.id ?? '')
    checkVersion(p, input.ifVersion)
    if (p.status === 'signed_off') throw unprocessable('This assessment is already signed off.')
    if (!p.risks.length) throw unprocessable('Add at least one risk before signing off (step 3).')
    const unmitigated = p.risks.filter((r) => r.mitigation.trim().length < 3)
    if (unmitigated.length) {
      throw unprocessable(
        `Describe a mitigation for every risk before signing off (step 4). ${unmitigated.length} still need one.`,
      )
    }
    p.decision = input.decision
    p.conditions = input.decision === 'proceed_with_conditions' ? (input.conditions ?? null) : null
    p.signedOffBy = ctx.user.id
    p.signedOffAt = ctx.now.toISOString()
    p.status = 'signed_off'
    p.currentStep = 5
    touch(ctx, p)
    audit(
      ctx,
      'pia.signed_off',
      { type: 'pia', id: p.id, label: label(ctx, p) },
      {
        decision: p.decision,
        overallScore: p.overallScore,
      },
    )
    const pa = ctx.db.processingActivities.find((a) => a.id === p.processingActivityId)
    if (pa) {
      notify(
        ctx,
        [pa.owner],
        'approval_decided',
        `${p.ref} was signed off: ${PIA_DECISION_LABELS[p.decision]}`,
        `${ctx.user.name} signed off the impact assessment for ${pa.name}.`,
        `/${ctx.org.slug}/privacy/pia/${p.id}`,
      )
    }
    commit()
    return json(summarize(ctx, p))
  }),

  orgRoute('DELETE', '/pias/:id', { ...opts, permission: 'privacy.edit' }, (ctx) => {
    const p = findStored(ctx, ctx.params.id ?? '')
    if (p.status === 'signed_off')
      throw unprocessable('Signed-off assessments are kept as records.')
    ctx.db.pias = ctx.db.pias.filter((x) => x.id !== p.id)
    audit(ctx, 'pia.deleted', { type: 'pia', id: p.id, label: label(ctx, p) })
    commit()
    return noContent()
  }),
]
