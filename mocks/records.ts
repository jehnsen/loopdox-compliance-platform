import type { BaseEntity, RecordRef, RecordType } from '@/lib/api/types'
import { hasFeature } from '@/lib/entitlements'
import { RECORD_FEATURES, recordHref } from '@/lib/links'
import { DSR_TYPE_LABELS } from '@/lib/privacy'
import { visibleDocs } from '@/mocks/handlers/documents'
import { canSeePrivacy } from '@/mocks/privacy'
import type { OrgCtx } from '@/mocks/router'

/**
 * One registry of linkable records: what the caller may see of each type, as
 * RecordRefs, plus the stored record for link writes. Used by /links, link
 * candidates and search.
 */

export interface RecordEntry extends RecordRef {
  /** Extra text for search. */
  text: string
}

type Stored = BaseEntity & Record<string, unknown>

interface RecordSource {
  /** Records of this type the caller may see. */
  visible: (ctx: OrgCtx) => RecordEntry[]
  /** The stored record in the caller's org, regardless of visibility. */
  stored: (ctx: OrgCtx, id: string) => Stored | undefined
}

function inOrg<T extends BaseEntity>(ctx: OrgCtx, items: T[]): T[] {
  return items.filter((i) => i.orgId === ctx.org.id)
}

function finder<T extends BaseEntity>(pick: (ctx: OrgCtx) => T[]) {
  return (ctx: OrgCtx, id: string) =>
    pick(ctx).find((i) => i.orgId === ctx.org.id && i.id === id) as Stored | undefined
}

const entry = (
  ctx: OrgCtx,
  type: RecordType,
  r: { id: string },
  ref: string | null,
  title: string,
  status: string | null,
  text = '',
): RecordEntry => ({
  type,
  id: r.id,
  ref,
  title,
  href: recordHref(ctx.org.slug, type, r.id),
  status,
  text,
})

export const RECORDS: Record<RecordType, RecordSource> = {
  document: {
    visible: (ctx) =>
      ctx.can('policies.read')
        ? visibleDocs(ctx).map((d) => entry(ctx, 'document', d, d.docId, d.title, d.status))
        : [],
    stored: finder((ctx) => ctx.db.documents),
  },
  processing_activity: {
    visible: (ctx) =>
      inOrg(ctx, ctx.db.processingActivities)
        .filter((p) => canSeePrivacy(ctx, p.status === 'approved'))
        .map((p) => entry(ctx, 'processing_activity', p, p.ref, p.name, p.status, p.purpose)),
    stored: finder((ctx) => ctx.db.processingActivities),
  },
  pia: {
    visible: (ctx) =>
      inOrg(ctx, ctx.db.pias)
        .filter((p) => canSeePrivacy(ctx, p.status === 'signed_off'))
        .map((p) => {
          const pa = ctx.db.processingActivities.find((a) => a.id === p.processingActivityId)
          return entry(
            ctx,
            'pia',
            p,
            p.ref,
            `Impact assessment: ${pa?.name ?? 'processing activity'}`,
            p.status,
            p.scope,
          )
        }),
    stored: finder((ctx) => ctx.db.pias),
  },
  dsr: {
    // Titles never include the requester: search and links must not expose identities.
    visible: (ctx) =>
      inOrg(ctx, ctx.db.dsrs)
        .filter((d) => canSeePrivacy(ctx, d.status === 'closed'))
        .map((d) => entry(ctx, 'dsr', d, d.ref, `${DSR_TYPE_LABELS[d.type]} request`, d.status)),
    stored: finder((ctx) => ctx.db.dsrs),
  },
  incident: {
    visible: (ctx) =>
      inOrg(ctx, ctx.db.incidents)
        .filter((i) => canSeePrivacy(ctx, i.status === 'closed'))
        .map((i) => entry(ctx, 'incident', i, i.ref, i.title, i.status, i.description)),
    stored: finder((ctx) => ctx.db.incidents),
  },
  agreement: {
    visible: (ctx) =>
      canSeePrivacy(ctx, true)
        ? inOrg(ctx, ctx.db.agreements).map((a) =>
            entry(ctx, 'agreement', a, a.ref, a.counterparty, null, a.notes),
          )
        : [],
    stored: finder((ctx) => ctx.db.agreements),
  },
  system: {
    visible: (ctx) =>
      ctx.can('security.read') || ctx.can('privacy.read')
        ? inOrg(ctx, ctx.db.systems).map((s) =>
            entry(ctx, 'system', s, null, s.name, null, s.provider),
          )
        : [],
    stored: finder((ctx) => ctx.db.systems),
  },
  risk: {
    visible: (ctx) =>
      ctx.can('security.read')
        ? inOrg(ctx, ctx.db.risks).map((r) => entry(ctx, 'risk', r, r.ref, r.title, r.status))
        : [],
    stored: finder((ctx) => ctx.db.risks),
  },
}

/** Whether the org's plan includes the module a record type belongs to. */
export function typeInPlan(ctx: OrgCtx, type: RecordType): boolean {
  return hasFeature(ctx.org.tier, RECORD_FEATURES[type])
}

/** Visible records of `type`, empty when the plan lacks the module. */
export function visibleRecords(ctx: OrgCtx, type: RecordType): RecordEntry[] {
  return typeInPlan(ctx, type) ? RECORDS[type].visible(ctx) : []
}
