import type { LinkGroup, LinksResponse, RecordType } from '@/lib/api/types'
import { findRelation, RECORD_LABELS, relationsFor, type LinkRelation } from '@/lib/links'
import { linkSchema, recordTypeSchema } from '@/lib/schemas/privacy'
import { audit } from '@/mocks/audit'
import { touch } from '@/mocks/helpers'
import { forbidden, HttpError, json, noContent, notFound, parse } from '@/mocks/http'
import { RECORDS, typeInPlan, visibleRecords } from '@/mocks/records'
import { searchSources } from '@/mocks/handlers/search'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit } from '@/mocks/store'
import { unprocessable } from '@/mocks/privacy'

/** Every relation owner today is a privacy record, edited with privacy.edit. */
function canEditLinks(ctx: OrgCtx, relation: LinkRelation): boolean {
  return !relation.managed && ctx.can('privacy.edit') && typeInPlan(ctx, relation.owner)
}

function readType(ctx: OrgCtx, name: string): RecordType {
  const parsed = recordTypeSchema.safeParse(ctx.query.get(name))
  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', `Unknown record type.`, {
      [name]: 'Unknown type.',
    })
  }
  return parsed.data
}

/** IDs stored in a relation field (array or single). */
function storedIds(record: Record<string, unknown>, relation: LinkRelation): string[] {
  const value = record[relation.field]
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  return typeof value === 'string' ? [value] : []
}

/** The record if the caller can see it; 404 otherwise. */
function visibleRecord(ctx: OrgCtx, type: RecordType, id: string) {
  if (!visibleRecords(ctx, type).some((r) => r.id === id)) throw notFound('Record')
  const stored = RECORDS[type].stored(ctx, id)
  if (!stored) throw notFound('Record')
  return stored
}

function groupsFor(ctx: OrgCtx, type: RecordType, id: string): LinkGroup[] {
  const self = visibleRecord(ctx, type, id)
  const groups: LinkGroup[] = []
  for (const { relation, other, direction } of relationsFor(type)) {
    if (!typeInPlan(ctx, other)) continue
    const candidates = visibleRecords(ctx, other)
    let ids: string[]
    if (direction === 'to') {
      ids = storedIds(self, relation)
    } else {
      ids = candidates
        .filter((c) => {
          const owner = RECORDS[other].stored(ctx, c.id)
          return owner ? storedIds(owner, relation).includes(id) : false
        })
        .map((c) => c.id)
    }
    const items = candidates
      .filter((c) => ids.includes(c.id))
      .map(({ text: _text, ...ref }) => ({ ...ref, direction }))
    groups.push({
      type: other,
      label: RECORD_LABELS[other].many,
      items,
      linkable: canEditLinks(ctx, relation),
    })
  }
  return groups
}

function resolveLink(
  ctx: OrgCtx,
  input: { from: { type: RecordType; id: string }; to: { type: RecordType; id: string } },
) {
  const found = findRelation(input.from.type, input.to.type)
  if (!found) throw unprocessable('These two kinds of record can’t be linked.')
  const { relation, ownerIsA } = found
  if (relation.managed) throw unprocessable('Change this link from the record’s own form.')
  if (!ctx.can('privacy.edit')) throw forbidden()
  const ownerSide = ownerIsA ? input.from : input.to
  const targetSide = ownerIsA ? input.to : input.from
  const owner = visibleRecord(ctx, ownerSide.type, ownerSide.id)
  visibleRecord(ctx, targetSide.type, targetSide.id)
  return {
    relation,
    owner,
    ownerType: ownerSide.type,
    targetType: targetSide.type,
    targetId: targetSide.id,
  }
}

function linkTarget(ctx: OrgCtx, type: RecordType, id: string) {
  const r = visibleRecords(ctx, type).find((x) => x.id === id)
  return { type, id, ref: r?.ref ?? null, title: r?.title ?? '' }
}

function auditLabel(ctx: OrgCtx, type: RecordType, id: string): string {
  const r = visibleRecords(ctx, type).find((x) => x.id === id)
  return r ? [r.ref, r.title].filter(Boolean).join(' ') : id
}

export const linkRoutes: RouteDef[] = [
  orgRoute('GET', '/links', {}, (ctx) => {
    const type = readType(ctx, 'type')
    const id = ctx.query.get('id') ?? ''
    if (!typeInPlan(ctx, type)) throw notFound('Record')
    const body: LinksResponse = { groups: groupsFor(ctx, type, id) }
    return json(body)
  }),

  orgRoute('GET', '/links/candidates', {}, (ctx) => {
    const type = readType(ctx, 'type')
    // `ids=pa_001,pa_002` resolves specific records (for showing a form's current links).
    const ids = ctx.query.get('ids')?.split(',').filter(Boolean)
    if (ids) {
      const items = visibleRecords(ctx, type)
        .filter((r) => ids.includes(r.id))
        .map(({ text: _text, ...ref }) => ref)
      return json({ items })
    }
    const q = (ctx.query.get('q') ?? '').trim().toLowerCase()
    // `for=processing_activity:pa_002` leaves out records already linked to it.
    const [forType, forId] = (ctx.query.get('for') ?? '').split(':')
    let exclude: string[] = []
    const parsedFor = recordTypeSchema.safeParse(forType)
    if (parsedFor.success && forId) {
      exclude = groupsFor(ctx, parsedFor.data, forId)
        .filter((g) => g.type === type)
        .flatMap((g) => g.items.map((i) => i.id))
    }
    const items = visibleRecords(ctx, type)
      .filter((r) => !exclude.includes(r.id))
      .filter((r) => !q || `${r.ref ?? ''} ${r.title}`.toLowerCase().includes(q))
      .slice(0, 20)
      .map(({ text: _text, ...ref }) => ref)
    return json({ items })
  }),

  orgRoute('POST', '/links', { feature: 'privacy' }, async (ctx) => {
    const input = parse(linkSchema, await ctx.json())
    const { relation, owner, ownerType, targetType, targetId } = resolveLink(ctx, input)
    const ids = storedIds(owner, relation)
    if (!ids.includes(targetId)) {
      owner[relation.field] = relation.single ? targetId : [...ids, targetId]
      touch(ctx, owner)
      audit(
        ctx,
        `${ownerType}.linked`,
        { type: ownerType, id: owner.id, label: auditLabel(ctx, ownerType, owner.id) },
        linkTarget(ctx, targetType, targetId),
      )
      commit()
    }
    return noContent()
  }),

  orgRoute('DELETE', '/links', { feature: 'privacy' }, (ctx) => {
    const input = parse(linkSchema, {
      from: { type: ctx.query.get('fromType'), id: ctx.query.get('fromId') },
      to: { type: ctx.query.get('toType'), id: ctx.query.get('toId') },
    })
    const { relation, owner, ownerType, targetType, targetId } = resolveLink(ctx, input)
    const ids = storedIds(owner, relation)
    if (ids.includes(targetId)) {
      owner[relation.field] = ids.filter((i) => i !== targetId)
      touch(ctx, owner)
      audit(
        ctx,
        `${ownerType}.unlinked`,
        { type: ownerType, id: owner.id, label: auditLabel(ctx, ownerType, owner.id) },
        linkTarget(ctx, targetType, targetId),
      )
      commit()
    }
    return noContent()
  }),
]

// Privacy records are searchable by reference and title (never by a requester's identity).
for (const type of ['processing_activity', 'pia', 'dsr', 'incident', 'agreement'] as const) {
  searchSources.push({
    type,
    label: RECORD_LABELS[type].many,
    items: (ctx) =>
      visibleRecords(ctx, type).map(({ status: _status, ...r }) => ({ ...r, snippet: null })),
  })
}
