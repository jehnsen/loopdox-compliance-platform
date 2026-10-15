import type { System, SystemSummary } from '@/lib/api/types'
import { systemFormSchema, updateSystemSchema } from '@/lib/schemas/security'
import { audit } from '@/mocks/audit'
import { baseFields, touch, userName } from '@/mocks/helpers'
import { checkVersion, json, noContent, notFound, paginate, parse } from '@/mocks/http'
import { assertMember, nextRef, unprocessable } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { orgSystems } from '@/mocks/security'
import { commit } from '@/mocks/store'

const opts = { feature: 'security' as const }

function summarize(ctx: OrgCtx, s: System): SystemSummary {
  return {
    ...s,
    ownerName: userName(ctx.db, s.owner),
    updatedByName: userName(ctx.db, s.updatedBy),
    grantCount: ctx.db.accessGrants.filter(
      (g) => g.orgId === ctx.org.id && g.systemId === s.id && g.status === 'active',
    ).length,
    secretCount: ctx.db.secrets.filter((x) => x.orgId === ctx.org.id && x.systemId === s.id).length,
  }
}

function findStored(ctx: OrgCtx, id: string): System {
  const s = orgSystems(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!s) throw notFound('System')
  return s
}

const label = (s: System) => `${s.ref} ${s.name}`

/** Everything that still points at a system, so it can't be deleted from under it. */
function usage(ctx: OrgCtx, id: string): string[] {
  const org = ctx.org.id
  const count = (n: number, one: string, many: string) =>
    n ? [`${n} ${n === 1 ? one : many}`] : []
  return [
    ...count(
      ctx.db.accessGrants.filter(
        (g) => g.orgId === org && g.systemId === id && g.status === 'active',
      ).length,
      'access grant',
      'access grants',
    ),
    ...count(
      ctx.db.secrets.filter((x) => x.orgId === org && x.systemId === id).length,
      'secret record',
      'secret records',
    ),
    ...count(
      ctx.db.changes.filter((c) => c.orgId === org && c.systemId === id).length,
      'change',
      'changes',
    ),
    ...count(
      ctx.db.decisions.filter((d) => d.orgId === org && d.systemIds.includes(id)).length,
      'decision',
      'decisions',
    ),
    ...count(
      ctx.db.processingActivities.filter((p) => p.orgId === org && p.systemIds.includes(id)).length,
      'processing record',
      'processing records',
    ),
    ...count(
      ctx.db.incidents.filter((i) => i.orgId === org && i.systemIds.includes(id)).length,
      'incident',
      'incidents',
    ),
  ]
}

export const systemRoutes: RouteDef[] = [
  orgRoute('GET', '/systems', { ...opts, permission: 'security.read' }, (ctx) => {
    const items = orgSystems(ctx).map((s) => summarize(ctx, s))
    return json(
      paginate(items, ctx.query, {
        search: (s) => [s.ref, s.name, s.provider, s.hosting, s.notes],
        defaultSort: 'name',
        filters: {
          type: (s, v) => v.includes(s.type),
          classification: (s, v) => v.includes(s.classification),
          personalData: (s, v) => v.includes(String(s.holdsPersonalData)),
        },
      }),
    )
  }),

  orgRoute('POST', '/systems', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const input = parse(systemFormSchema, await ctx.json())
    assertMember(ctx, input.owner, 'owner')
    const s: System = {
      ...baseFields(ctx, 'sys'),
      ref: nextRef(
        orgSystems(ctx).map((x) => x.ref),
        'SYS',
      ),
      ...input,
    }
    ctx.db.systems.push(s)
    audit(ctx, 'system.created', { type: 'system', id: s.id, label: label(s) })
    commit()
    return json(summarize(ctx, s), 201)
  }),

  orgRoute('GET', '/systems/:id', { ...opts, permission: 'security.read' }, (ctx) =>
    json(summarize(ctx, findStored(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/systems/:id', { ...opts, permission: 'security.edit' }, async (ctx) => {
    const { ifVersion, ...input } = parse(updateSystemSchema, await ctx.json())
    const s = findStored(ctx, ctx.params.id ?? '')
    checkVersion(s, ifVersion)
    assertMember(ctx, input.owner, 'owner')
    Object.assign(s, input)
    touch(ctx, s)
    audit(ctx, 'system.updated', { type: 'system', id: s.id, label: label(s) })
    commit()
    return json(summarize(ctx, s))
  }),

  orgRoute('DELETE', '/systems/:id', { ...opts, permission: 'security.edit' }, (ctx) => {
    const s = findStored(ctx, ctx.params.id ?? '')
    const used = usage(ctx, s.id)
    if (used.length) {
      throw unprocessable(
        `${s.name} is still used by ${used.join(', ')}. Remove or reassign those first.`,
      )
    }
    ctx.db.systems = ctx.db.systems.filter((x) => x.id !== s.id)
    audit(ctx, 'system.deleted', { type: 'system', id: s.id, label: label(s) })
    commit()
    return noContent()
  }),
]
