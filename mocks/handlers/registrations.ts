import type {
  Registration,
  RegistrationSummary,
  TrainingRecord,
  TrainingRecordSummary,
} from '@/lib/api/types'
import { RENEWAL_LEAD_DAYS } from '@/lib/privacy'
import {
  registrationFormSchema,
  trainingRecordSchema,
  updateRegistrationSchema,
} from '@/lib/schemas/privacy'
import { audit } from '@/mocks/audit'
import { baseFields, touch, userName } from '@/mocks/helpers'
import { checkVersion, json, noContent, notFound, paginate, parse } from '@/mocks/http'
import { assertMember, canSeePrivacy, dueState, unprocessable } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit } from '@/mocks/store'

/** NPC registration and training records: always-final records, visible to every privacy reader. */

const opts = { feature: 'privacy' as const }

// ---------------------------------------------------------------------------
// NPC registration
// ---------------------------------------------------------------------------

function summarizeRegistration(ctx: OrgCtx, r: Registration): RegistrationSummary {
  const { state, days } = dueState(ctx, r.renewsAt, RENEWAL_LEAD_DAYS)
  return {
    ...r,
    status: state === 'overdue' ? 'expired' : state === 'due_soon' ? 'renewal_due' : 'registered',
    daysToRenewal: days,
  }
}

function findRegistration(ctx: OrgCtx, id: string): Registration {
  const r = ctx.db.registrations.find((x) => x.orgId === ctx.org.id && x.id === id)
  if (!r || !canSeePrivacy(ctx, true)) throw notFound('Registration')
  return r
}

const regLabel = (r: Registration) => `NPC registration ${r.reference}`

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

function summarizeTraining(ctx: OrgCtx, t: TrainingRecord): TrainingRecordSummary {
  const state = t.expiresAt ? dueState(ctx, t.expiresAt, RENEWAL_LEAD_DAYS).state : 'ok'
  return {
    ...t,
    userName: userName(ctx.db, t.userId),
    state: state === 'overdue' ? 'expired' : state === 'due_soon' ? 'expiring' : 'valid',
  }
}

function findTraining(ctx: OrgCtx, id: string): TrainingRecord {
  const t = ctx.db.trainingRecords.find((x) => x.orgId === ctx.org.id && x.id === id)
  if (!t || !canSeePrivacy(ctx, true)) throw notFound('Training record')
  return t
}

const trainingLabel = (ctx: OrgCtx, t: TrainingRecord) =>
  `${t.course}: ${userName(ctx.db, t.userId)}`

export const registrationRoutes: RouteDef[] = [
  orgRoute('GET', '/registrations', { ...opts, permission: 'privacy.read' }, (ctx) => {
    const items = ctx.db.registrations
      .filter((r) => r.orgId === ctx.org.id)
      .map((r) => summarizeRegistration(ctx, r))
    return json(paginate(items, ctx.query, { defaultSort: '-registeredAt' }))
  }),

  orgRoute('POST', '/registrations', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const input = parse(registrationFormSchema, await ctx.json())
    if (ctx.db.registrations.some((r) => r.orgId === ctx.org.id)) {
      throw unprocessable(
        'This organisation already has a registration on record. Update it instead.',
      )
    }
    const r: Registration = { ...baseFields(ctx, 'reg'), registrar: 'NPC', ...input }
    ctx.db.registrations.push(r)
    audit(ctx, 'registration.created', { type: 'registration', id: r.id, label: regLabel(r) })
    commit()
    return json(summarizeRegistration(ctx, r), 201)
  }),

  orgRoute('GET', '/registrations/:id', { ...opts, permission: 'privacy.read' }, (ctx) =>
    json(summarizeRegistration(ctx, findRegistration(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/registrations/:id', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const { ifVersion, ...input } = parse(updateRegistrationSchema, await ctx.json())
    const r = findRegistration(ctx, ctx.params.id ?? '')
    checkVersion(r, ifVersion)
    const renewed = input.renewsAt > r.renewsAt
    const dpoChanged = input.dpoName !== r.dpoName
    Object.assign(r, input)
    touch(ctx, r)
    audit(
      ctx,
      renewed ? 'registration.renewed' : 'registration.updated',
      { type: 'registration', id: r.id, label: regLabel(r) },
      {
        ...(renewed ? { renewsAt: r.renewsAt } : {}),
        ...(dpoChanged ? { dpoName: r.dpoName } : {}),
      },
    )
    commit()
    return json(summarizeRegistration(ctx, r))
  }),

  orgRoute('GET', '/training-records', { ...opts, permission: 'privacy.read' }, (ctx) => {
    const items = ctx.db.trainingRecords
      .filter((t) => t.orgId === ctx.org.id && canSeePrivacy(ctx, true))
      .map((t) => summarizeTraining(ctx, t))
    return json(
      paginate(items, ctx.query, {
        search: (t) => [t.course, t.userName],
        defaultSort: 'course',
        filters: {
          userId: (t, v) => v.includes(t.userId),
          course: (t, v) => v.includes(t.course),
          state: (t, v) => v.includes(t.state),
        },
      }),
    )
  }),

  orgRoute('POST', '/training-records', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const input = parse(trainingRecordSchema, await ctx.json())
    assertMember(ctx, input.userId, 'userId')
    const t: TrainingRecord = { ...baseFields(ctx, 'trn'), ...input }
    ctx.db.trainingRecords.push(t)
    audit(ctx, 'training.recorded', {
      type: 'training_record',
      id: t.id,
      label: trainingLabel(ctx, t),
    })
    commit()
    return json(summarizeTraining(ctx, t), 201)
  }),

  orgRoute(
    'PATCH',
    '/training-records/:id',
    { ...opts, permission: 'privacy.edit' },
    async (ctx) => {
      const body = (await ctx.json()) as { ifVersion?: number }
      const input = parse(trainingRecordSchema, body)
      const t = findTraining(ctx, ctx.params.id ?? '')
      checkVersion(t, body.ifVersion)
      assertMember(ctx, input.userId, 'userId')
      Object.assign(t, input)
      touch(ctx, t)
      audit(ctx, 'training.updated', {
        type: 'training_record',
        id: t.id,
        label: trainingLabel(ctx, t),
      })
      commit()
      return json(summarizeTraining(ctx, t))
    },
  ),

  orgRoute('DELETE', '/training-records/:id', { ...opts, permission: 'privacy.edit' }, (ctx) => {
    const t = findTraining(ctx, ctx.params.id ?? '')
    ctx.db.trainingRecords = ctx.db.trainingRecords.filter((x) => x.id !== t.id)
    audit(ctx, 'training.deleted', {
      type: 'training_record',
      id: t.id,
      label: trainingLabel(ctx, t),
    })
    commit()
    return noContent()
  }),
]
