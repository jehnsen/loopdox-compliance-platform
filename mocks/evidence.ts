import type {
  AuditPackPolicy,
  Connector,
  Control,
  ControlSummary,
  Evidence,
  EvidenceItem,
} from '@/lib/api/types'
import { CREDENTIAL_FIELDS } from '@/lib/schemas/evidence'
import { controlStatusFrom, PROVIDERS } from '@/lib/evidence'
import { todayInTz } from '@/lib/utils/dates'
import { visibleDocs } from '@/mocks/handlers/documents'
import { userName } from '@/mocks/helpers'
import { HttpError } from '@/mocks/http'
import type { OrgCtx } from '@/mocks/router'

/** Helpers shared by the Evidence handlers and the other modules that record evidence. */

export function orgEvidence(ctx: OrgCtx): Evidence[] {
  return ctx.db.evidence.filter((e) => e.orgId === ctx.org.id)
}

export function orgControls(ctx: OrgCtx): Control[] {
  return ctx.db.controls.filter((c) => c.orgId === ctx.org.id)
}

export function orgConnectors(ctx: OrgCtx): Connector[] {
  return ctx.db.connectors.filter((c) => c.orgId === ctx.org.id)
}

export function evidenceItem(ctx: OrgCtx, e: Evidence): EvidenceItem {
  const file = e.fileId ? ctx.db.files.find((f) => f.id === e.fileId) : undefined
  let fileRef: EvidenceItem['file'] = null
  if (file) {
    const { orgId: _orgId, ...ref } = file
    fileRef = ref
  }
  const control = ctx.db.controls.find((c) => c.id === e.controlId)
  const connector = e.connectorId ? ctx.db.connectors.find((c) => c.id === e.connectorId) : null
  return {
    ...e,
    controlReference: control?.reference ?? '',
    controlTitle: control?.title ?? '',
    // Connector items are collected by the system, not by a person.
    collectedByName:
      e.source === 'connector' || !e.createdBy ? null : userName(ctx.db, e.createdBy),
    file: fileRef,
    connectorName: connector ? PROVIDERS[connector.provider].name : null,
    originHref:
      e.origin?.type === 'access_review'
        ? `/${ctx.org.slug}/security/access-reviews/${e.origin.id}`
        : null,
  }
}

/** Newest evidence first. */
export const byNewest = (a: { collectedAt: string }, b: { collectedAt: string }) =>
  b.collectedAt.localeCompare(a.collectedAt)

/**
 * Policy IDs the caller may see on a control. Drafts and anything never approved stay
 * hidden from people who can't read drafts (auditors, approvers without the right).
 */
export function visibleDocumentIds(ctx: OrgCtx): Set<string> {
  return new Set(visibleDocs(ctx).map((d) => d.id))
}

export function controlSummary(
  ctx: OrgCtx,
  c: Control,
  visible: Set<string> = visibleDocumentIds(ctx),
): ControlSummary {
  const items = orgEvidence(ctx).filter((e) => e.controlId === c.id)
  const last = items.reduce<string | null>(
    (max, e) => (max === null || e.collectedAt > max ? e.collectedAt : max),
    null,
  )
  return {
    ...c,
    documentIds: c.documentIds.filter((id) => visible.has(id)),
    ownerName: userName(ctx.db, c.owner),
    evidenceCount: items.length,
    lastEvidenceAt: last,
    connectors: orgConnectors(ctx)
      .filter((co) => co.checks.some((ch) => ch.controlId === c.id))
      .map((co) => ({
        id: co.id,
        provider: co.provider,
        name: PROVIDERS[co.provider].name,
        status: co.status,
      })),
  }
}

/** Re-judges a control from its evidence. Call after any evidence is added. */
export function refreshControlStatus(ctx: OrgCtx, controlId: string): void {
  const control = ctx.db.controls.find((c) => c.id === controlId)
  if (!control) return
  control.status = controlStatusFrom(
    control.status,
    ctx.db.evidence.filter((e) => e.controlId === controlId),
  )
}

/**
 * Approved policies for a control: the approved version on record, and only for
 * documents the caller may see. Anything never approved is left out for everyone.
 */
export function approvedPolicies(
  ctx: OrgCtx,
  control: Control,
  docs = visibleDocs(ctx),
): AuditPackPolicy[] {
  return control.documentIds.flatMap((id) => {
    const d = docs.find((x) => x.id === id)
    if (!d || d.approvedVersion === null || d.status === 'retired') return []
    return [
      {
        id: d.id,
        docId: d.docId,
        title: d.title,
        version: d.approvedVersion,
        approvedAt: d.approvedAt,
        approvedByName: d.approvedBy ? userName(ctx.db, d.approvedBy) : null,
        effectiveDate: d.effectiveDate,
        href: `/${ctx.org.slug}/policies/${d.id}`,
      },
    ]
  })
}

/** The calendar date (tenant timezone) evidence was collected on. */
export function collectedOn(ctx: OrgCtx, e: { collectedAt: string }): string {
  return todayInTz(ctx.org.timezone, new Date(e.collectedAt))
}

/** `from` and `to` are inclusive calendar dates; either may be absent. */
export function inPeriod(
  ctx: OrgCtx,
  e: { collectedAt: string },
  from: string | null,
  to: string | null,
): boolean {
  const day = collectedOn(ctx, e)
  return (!from || day >= from) && (!to || day <= to)
}

/**
 * A connection form never carries a credential. A body that does is refused rather
 * than quietly dropped, like a secret's value (D117).
 */
export function rejectCredentials(body: unknown): void {
  if (!body || typeof body !== 'object') return
  const field = CREDENTIAL_FIELDS.find((f) => f in body)
  if (field) {
    throw new HttpError(
      400,
      'validation_error',
      'LoopDox never takes a provider credential here.',
      {
        [field]:
          'Connect through the provider’s own sign-in. LoopDox doesn’t take passwords, tokens or keys in this form.',
      },
    )
  }
}
