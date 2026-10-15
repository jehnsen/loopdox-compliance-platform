import type { SecretRecord, SecretRecordSummary } from '@/lib/api/types'
import { markRotatedSchema, secretFormSchema, updateSecretSchema } from '@/lib/schemas/security'
import { dueStateFor, nextRotationDate, SECRET_DUE_SOON_DAYS } from '@/lib/security'
import { audit } from '@/mocks/audit'
import { baseFields, touch, userName } from '@/mocks/helpers'
import { checkVersion, json, noContent, notFound, paginate, parse } from '@/mocks/http'
import { assertMember, nextRef, today } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { assertSystem, rejectSecretValue, systemOf } from '@/mocks/security'
import { commit } from '@/mocks/store'

const opts = { feature: 'security' as const }

function orgSecrets(ctx: OrgCtx): SecretRecord[] {
  return ctx.db.secrets.filter((s) => s.orgId === ctx.org.id)
}

function summarize(ctx: OrgCtx, s: SecretRecord): SecretRecordSummary {
  const due = dueStateFor(s.nextDueAt, SECRET_DUE_SOON_DAYS, ctx.org.timezone, ctx.now)
  return {
    ...s,
    systemName: systemOf(ctx, s.systemId)?.name ?? null,
    ownerName: userName(ctx.db, s.owner),
    updatedByName: userName(ctx.db, s.updatedBy),
    dueState: due.state,
    daysLeft: due.days,
  }
}

function findStored(ctx: OrgCtx, id: string): SecretRecord {
  const s = orgSecrets(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!s) throw notFound('Secret record')
  return s
}

const label = (s: SecretRecord) => `${s.ref} ${s.name}`

/** Audit details name where a secret lives, never anything that could be its value. */
export const secretRoutes: RouteDef[] = [
  orgRoute('GET', '/secret-records', { ...opts, permission: 'security.read' }, (ctx) => {
    const items = orgSecrets(ctx).map((s) => summarize(ctx, s))
    return json(
      paginate(items, ctx.query, {
        search: (s) => [s.ref, s.name, s.location, s.systemName, s.notes],
        // Overdue first: the soonest due date leads.
        defaultSort: 'nextDueAt',
        filters: {
          system: (s, v) => v.includes(s.systemId ?? 'none'),
          due: (s, v) => v.includes(s.dueState),
          owner: (s, v) => v.includes(s.owner),
        },
      }),
    )
  }),

  orgRoute('POST', '/secret-records', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const body = await ctx.json()
    rejectSecretValue(body)
    const input = parse(secretFormSchema, body)
    assertMember(ctx, input.owner, 'owner')
    if (input.systemId) assertSystem(ctx, input.systemId, 'systemId')
    const s: SecretRecord = {
      ...baseFields(ctx, 'scr'),
      ref: nextRef(
        orgSecrets(ctx).map((x) => x.ref),
        'SCR',
      ),
      ...input,
      nextDueAt: nextRotationDate(input.lastRotatedAt, input.rotationDays),
    }
    ctx.db.secrets.push(s)
    audit(ctx, 'secret.created', { type: 'secret_record', id: s.id, label: label(s) })
    commit()
    return json(summarize(ctx, s), 201)
  }),

  orgRoute('GET', '/secret-records/:id', { ...opts, permission: 'security.read' }, (ctx) =>
    json(summarize(ctx, findStored(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute(
    'PATCH',
    '/secret-records/:id',
    { ...opts, permission: 'security.edit' },
    async (ctx) => {
      const body = await ctx.json()
      rejectSecretValue(body)
      const { ifVersion, ...input } = parse(updateSecretSchema, body)
      const s = findStored(ctx, ctx.params.id ?? '')
      checkVersion(s, ifVersion)
      assertMember(ctx, input.owner, 'owner')
      if (input.systemId) assertSystem(ctx, input.systemId, 'systemId')
      Object.assign(s, input, {
        nextDueAt: nextRotationDate(input.lastRotatedAt, input.rotationDays),
      })
      touch(ctx, s)
      audit(ctx, 'secret.updated', { type: 'secret_record', id: s.id, label: label(s) })
      commit()
      return json(summarize(ctx, s))
    },
  ),

  // "Mark rotated" sets the last rotation to today (or the date given) and restarts the clock.
  orgRoute(
    'POST',
    '/secret-records/:id/mark-rotated',
    { ...opts, permission: 'security.edit' },
    async (ctx) => {
      const { ifVersion, rotatedAt } = parse(markRotatedSchema, await ctx.json())
      const s = findStored(ctx, ctx.params.id ?? '')
      checkVersion(s, ifVersion)
      s.lastRotatedAt = rotatedAt && rotatedAt <= today(ctx) ? rotatedAt : today(ctx)
      s.nextDueAt = nextRotationDate(s.lastRotatedAt, s.rotationDays)
      touch(ctx, s)
      audit(
        ctx,
        'secret.rotated',
        { type: 'secret_record', id: s.id, label: label(s) },
        { nextDueAt: s.nextDueAt },
      )
      commit()
      return json(summarize(ctx, s))
    },
  ),

  orgRoute('DELETE', '/secret-records/:id', { ...opts, permission: 'security.edit' }, (ctx) => {
    const s = findStored(ctx, ctx.params.id ?? '')
    ctx.db.secrets = ctx.db.secrets.filter((x) => x.id !== s.id)
    audit(ctx, 'secret.deleted', { type: 'secret_record', id: s.id, label: label(s) })
    commit()
    return noContent()
  }),
]
