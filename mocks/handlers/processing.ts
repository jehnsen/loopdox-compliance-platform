import type {
  ProcessingActivity,
  ProcessingActivitySummary,
  ProcessingWarning,
} from '@/lib/api/types'
import { LEGAL_BASIS_LABELS } from '@/lib/privacy'
import { processingFormSchema, updateProcessingSchema } from '@/lib/schemas/privacy'
import { audit } from '@/mocks/audit'
import { baseFields, csvResponse, touch, userName } from '@/mocks/helpers'
import { checkVersion, json, noContent, notFound, paginate, parse } from '@/mocks/http'
import { assertMember, canSeePrivacy, nextRef, today, unprocessable } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit } from '@/mocks/store'

const opts = { feature: 'privacy' as const }

function orgActivities(ctx: OrgCtx): ProcessingActivity[] {
  return ctx.db.processingActivities.filter((p) => p.orgId === ctx.org.id)
}

export function summarizeActivity(ctx: OrgCtx, p: ProcessingActivity): ProcessingActivitySummary {
  const pias = ctx.db.pias
    .filter((x) => x.orgId === ctx.org.id && x.processingActivityId === p.id)
    .filter((x) => canSeePrivacy(ctx, x.status === 'signed_off'))
    .sort(
      (a, b) =>
        Number(b.status === 'signed_off') - Number(a.status === 'signed_off') ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
  const pia = pias[0] ?? null
  const agreements = ctx.db.agreements.filter(
    (a) => a.orgId === ctx.org.id && p.agreementIds.includes(a.id),
  )
  const recipientsWithoutAgreement = p.recipients
    .filter(
      (r) =>
        r.kind === 'third_party' &&
        !agreements.some(
          (a) => a.counterparty.trim().toLowerCase() === r.name.trim().toLowerCase(),
        ),
    )
    .map((r) => r.name)
  const warnings: ProcessingWarning[] = []
  if (p.status !== 'retired') {
    if (!pia) warnings.push('no_pia')
    if (recipientsWithoutAgreement.length) warnings.push('no_agreement')
    if (!p.retention) warnings.push('no_retention')
  }
  return {
    ...p,
    ownerName: userName(ctx.db, p.owner),
    updatedByName: userName(ctx.db, p.updatedBy),
    piaId: pia?.id ?? null,
    piaRef: pia?.ref ?? null,
    piaStatus: pia?.status ?? null,
    hasSensitive: p.dataCategories.some((c) => c.sensitive),
    warnings,
    recipientsWithoutAgreement,
  }
}

function visibleActivities(ctx: OrgCtx): ProcessingActivitySummary[] {
  return orgActivities(ctx)
    .filter((p) => canSeePrivacy(ctx, p.status === 'approved'))
    .map((p) => summarizeActivity(ctx, p))
}

function findStored(ctx: OrgCtx, id: string): ProcessingActivity {
  const p = orgActivities(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!p || !canSeePrivacy(ctx, p.status === 'approved')) throw notFound('Processing record')
  return p
}

const listOptions = {
  search: (p: ProcessingActivitySummary) => [p.ref, p.name, p.purpose, p.ownerName],
  defaultSort: 'ref',
  filters: {
    status: (p: ProcessingActivitySummary, v: string[]) => v.includes(p.status),
    owner: (p: ProcessingActivitySummary, v: string[]) => v.includes(p.owner),
    legalBasis: (p: ProcessingActivitySummary, v: string[]) => v.includes(p.legalBasis),
    warning: (p: ProcessingActivitySummary, v: string[]) => p.warnings.some((w) => v.includes(w)),
    sensitive: (p: ProcessingActivitySummary, v: string[]) => v.includes(String(p.hasSensitive)),
  },
}

function label(p: ProcessingActivity): string {
  return `${p.ref} ${p.name}`
}

function normalise<
  T extends { retention: string | null; crossBorder: { transfers: boolean; countries: string[] } },
>(input: T): T {
  return {
    ...input,
    retention: input.retention?.trim() || null,
    crossBorder: input.crossBorder.transfers
      ? input.crossBorder
      : { transfers: false, countries: [] },
  }
}

export const processingRoutes: RouteDef[] = [
  orgRoute('GET', '/processing-activities', { ...opts, permission: 'privacy.read' }, (ctx) =>
    json(paginate(visibleActivities(ctx), ctx.query, listOptions)),
  ),

  orgRoute(
    'GET',
    '/processing-activities/export',
    { ...opts, permission: 'privacy.read' },
    (ctx) => {
      const all = paginate(
        visibleActivities(ctx),
        new URLSearchParams([...ctx.query, ['page', '1'], ['pageSize', '200']]),
        listOptions,
      )
      return csvResponse(
        `processing-records-${ctx.org.slug}-${today(ctx)}.csv`,
        [
          'ID',
          'Name',
          'Purpose',
          'Legal basis',
          'Data subjects',
          'Data categories',
          'Sensitive',
          'Recipients',
          'Cross-border',
          'Retention',
          'Owner',
          'Status',
        ],
        all.items.map((p) => [
          p.ref,
          p.name,
          p.purpose,
          LEGAL_BASIS_LABELS[p.legalBasis],
          p.dataSubjects.join('; '),
          p.dataCategories.map((c) => (c.sensitive ? `${c.name} (sensitive)` : c.name)).join('; '),
          p.hasSensitive ? 'Yes' : 'No',
          p.recipients.map((r) => r.name).join('; '),
          p.crossBorder.transfers ? p.crossBorder.countries.join('; ') : 'No',
          p.retention ?? '',
          p.ownerName,
          p.status,
        ]),
      )
    },
  ),

  orgRoute(
    'POST',
    '/processing-activities',
    { ...opts, permission: 'privacy.edit' },
    async (ctx) => {
      const input = normalise(parse(processingFormSchema, await ctx.json()))
      assertMember(ctx, input.owner, 'owner')
      const p: ProcessingActivity = {
        ...baseFields(ctx, 'pa'),
        ref: nextRef(
          orgActivities(ctx).map((x) => x.ref),
          'PA',
        ),
        ...input,
        systemIds: [],
        agreementIds: [],
      }
      ctx.db.processingActivities.push(p)
      audit(ctx, 'processing_activity.created', {
        type: 'processing_activity',
        id: p.id,
        label: label(p),
      })
      commit()
      return json(summarizeActivity(ctx, p), 201)
    },
  ),

  orgRoute('GET', '/processing-activities/:id', { ...opts, permission: 'privacy.read' }, (ctx) =>
    json(summarizeActivity(ctx, findStored(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute(
    'PATCH',
    '/processing-activities/:id',
    { ...opts, permission: 'privacy.edit' },
    async (ctx) => {
      const { ifVersion, ...input } = parse(updateProcessingSchema, await ctx.json())
      const p = findStored(ctx, ctx.params.id ?? '')
      checkVersion(p, ifVersion)
      assertMember(ctx, input.owner, 'owner')
      const from = p.status
      Object.assign(p, normalise(input))
      touch(ctx, p)
      audit(
        ctx,
        'processing_activity.updated',
        { type: 'processing_activity', id: p.id, label: label(p) },
        from !== p.status ? { statusFrom: from, statusTo: p.status } : {},
      )
      commit()
      return json(summarizeActivity(ctx, p))
    },
  ),

  orgRoute(
    'DELETE',
    '/processing-activities/:id',
    { ...opts, permission: 'privacy.edit' },
    (ctx) => {
      const p = findStored(ctx, ctx.params.id ?? '')
      if (p.status !== 'draft')
        throw unprocessable('Only drafts can be deleted. Retire it instead.')
      const linked =
        ctx.db.pias.some((x) => x.processingActivityId === p.id) ||
        ctx.db.dsrs.some((x) => x.processingActivityIds.includes(p.id)) ||
        ctx.db.incidents.some((x) => x.processingActivityIds.includes(p.id))
      if (linked) {
        throw unprocessable(
          'Impact assessments, requests or incidents link to this record. Retire it instead.',
        )
      }
      ctx.db.processingActivities = ctx.db.processingActivities.filter((x) => x.id !== p.id)
      audit(ctx, 'processing_activity.deleted', {
        type: 'processing_activity',
        id: p.id,
        label: label(p),
      })
      commit()
      return noContent()
    },
  ),
]
