import type { Agreement, AgreementSummary, FileRef } from '@/lib/api/types'
import { RENEWAL_LEAD_DAYS } from '@/lib/privacy'
import { agreementFormSchema, updateAgreementSchema } from '@/lib/schemas/privacy'
import { audit } from '@/mocks/audit'
import { baseFields, touch, userName } from '@/mocks/helpers'
import { checkVersion, HttpError, json, noContent, notFound, paginate, parse } from '@/mocks/http'
import { assertMember, canSeePrivacy, dueState, nextRef } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit } from '@/mocks/store'

const opts = { feature: 'privacy' as const }

function orgAgreements(ctx: OrgCtx): Agreement[] {
  return ctx.db.agreements.filter((a) => a.orgId === ctx.org.id)
}

export function fileRef(ctx: OrgCtx, id: string | null): FileRef | null {
  const f = id ? ctx.db.files.find((x) => x.id === id && x.orgId === ctx.org.id) : undefined
  if (!f) return null
  const { orgId: _orgId, ...ref } = f
  return ref
}

function summarize(ctx: OrgCtx, a: Agreement): AgreementSummary {
  const renewal = a.renewsAt ? dueState(ctx, a.renewsAt, RENEWAL_LEAD_DAYS) : null
  return {
    ...a,
    ownerName: userName(ctx.db, a.owner),
    updatedByName: userName(ctx.db, a.updatedBy),
    file: fileRef(ctx, a.fileId),
    processingActivityIds: ctx.db.processingActivities
      .filter((p) => p.orgId === ctx.org.id && p.agreementIds.includes(a.id))
      .map((p) => p.id),
    renewalState: renewal?.state ?? null,
    daysToRenewal: renewal?.days ?? null,
  }
}

function findStored(ctx: OrgCtx, id: string): Agreement {
  const a = orgAgreements(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!a || !canSeePrivacy(ctx, true)) throw notFound('Agreement')
  return a
}

function assertFile(ctx: OrgCtx, fileId: string | null): void {
  if (fileId && !ctx.db.files.some((f) => f.id === fileId && f.orgId === ctx.org.id)) {
    throw new HttpError(400, 'validation_error', 'Upload the file again.', {
      fileId: 'That file is no longer available. Upload it again.',
    })
  }
}

/** The processing records listing this agreement become exactly `ids` (links are stored on them). */
function syncProcessing(ctx: OrgCtx, agreementId: string, ids: string[]): void {
  for (const p of ctx.db.processingActivities) {
    if (p.orgId !== ctx.org.id) continue
    const has = p.agreementIds.includes(agreementId)
    const want = ids.includes(p.id)
    if (has === want) continue
    p.agreementIds = want
      ? [...p.agreementIds, agreementId]
      : p.agreementIds.filter((x) => x !== agreementId)
    touch(ctx, p)
  }
}

function label(a: Agreement): string {
  return `${a.ref} ${a.counterparty}`
}

export const agreementRoutes: RouteDef[] = [
  orgRoute('GET', '/agreements', { ...opts, permission: 'privacy.read' }, (ctx) => {
    const items = orgAgreements(ctx).map((a) => summarize(ctx, a))
    return json(
      paginate(items, ctx.query, {
        search: (a) => [a.ref, a.counterparty, a.notes],
        defaultSort: 'renewsAt',
        filters: {
          type: (a, v) => v.includes(a.type),
          role: (a, v) => v.includes(a.role),
          renewal: (a, v) => v.includes(a.renewalState ?? 'none'),
          processingActivityId: (a, v) => a.processingActivityIds.some((id) => v.includes(id)),
        },
      }),
    )
  }),

  orgRoute('POST', '/agreements', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const { processingActivityIds, ...input } = parse(agreementFormSchema, await ctx.json())
    assertMember(ctx, input.owner, 'owner')
    assertFile(ctx, input.fileId)
    const a: Agreement = {
      ...baseFields(ctx, 'agr'),
      ref: nextRef(
        orgAgreements(ctx).map((x) => x.ref),
        'AGR',
      ),
      ...input,
    }
    ctx.db.agreements.push(a)
    syncProcessing(ctx, a.id, processingActivityIds)
    audit(ctx, 'agreement.created', { type: 'agreement', id: a.id, label: label(a) })
    commit()
    return json(summarize(ctx, a), 201)
  }),

  orgRoute('GET', '/agreements/:id', { ...opts, permission: 'privacy.read' }, (ctx) =>
    json(summarize(ctx, findStored(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/agreements/:id', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const { ifVersion, processingActivityIds, ...input } = parse(
      updateAgreementSchema,
      await ctx.json(),
    )
    const a = findStored(ctx, ctx.params.id ?? '')
    checkVersion(a, ifVersion)
    assertMember(ctx, input.owner, 'owner')
    assertFile(ctx, input.fileId)
    const renewed = Boolean(input.renewsAt && a.renewsAt && input.renewsAt > a.renewsAt)
    Object.assign(a, input)
    syncProcessing(ctx, a.id, processingActivityIds)
    touch(ctx, a)
    audit(
      ctx,
      renewed ? 'agreement.renewed' : 'agreement.updated',
      { type: 'agreement', id: a.id, label: label(a) },
      renewed ? { renewsAt: a.renewsAt } : {},
    )
    commit()
    return json(summarize(ctx, a))
  }),

  orgRoute('DELETE', '/agreements/:id', { ...opts, permission: 'privacy.edit' }, (ctx) => {
    const a = findStored(ctx, ctx.params.id ?? '')
    syncProcessing(ctx, a.id, [])
    ctx.db.agreements = ctx.db.agreements.filter((x) => x.id !== a.id)
    audit(ctx, 'agreement.deleted', { type: 'agreement', id: a.id, label: label(a) })
    commit()
    return noContent()
  }),
]
