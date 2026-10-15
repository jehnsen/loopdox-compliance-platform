import type { AuditPack, AuditPackControl } from '@/lib/api/types'
import { controlStatusFrom, frameworkRank, SOURCE_LABELS } from '@/lib/evidence'
import { FRAMEWORK_LABELS } from '@/lib/overview'
import { audit } from '@/mocks/audit'
import {
  approvedPolicies,
  byNewest,
  collectedOn,
  evidenceItem,
  inPeriod,
  orgControls,
  orgEvidence,
  visibleDocumentIds,
} from '@/mocks/evidence'
import { visibleDocs } from '@/mocks/handlers/documents'
import { csvResponse } from '@/mocks/helpers'
import { HttpError, json } from '@/mocks/http'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit } from '@/mocks/store'

const opts = { feature: 'evidence' as const, permission: 'evidence.read' as const }

const DATE = /^\d{4}-\d{2}-\d{2}$/

function dateParam(ctx: OrgCtx, name: 'from' | 'to'): string | null {
  const v = ctx.query.get(name)
  if (!v) return null
  if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new HttpError(400, 'validation_error', `“${name}” must be a date like 2026-10-14.`, {
      [name]: 'Enter a date.',
    })
  }
  return v
}

/**
 * Controls → approved policy → evidence, for a period. Only the approved version of a
 * policy appears, and only policies the caller may see, so an auditor never meets a draft.
 */
function buildPack(ctx: OrgCtx): AuditPack {
  const from = dateParam(ctx, 'from')
  const to = dateParam(ctx, 'to')
  if (from && to && from > to) {
    throw new HttpError(400, 'validation_error', 'The period ends before it starts.', {
      to: 'Choose a date on or after the start.',
    })
  }
  const frameworks = ctx.query.getAll('framework').flatMap((v) => v.split(','))
  const docs = visibleDocs(ctx)
  const visible = visibleDocumentIds(ctx)
  const evidence = orgEvidence(ctx)

  const controls: AuditPackControl[] = orgControls(ctx)
    .filter((c) => !frameworks.length || frameworks.includes(c.framework))
    .sort(
      (a, b) =>
        frameworkRank(a.framework) - frameworkRank(b.framework) ||
        a.reference.localeCompare(b.reference, 'en', { numeric: true }),
    )
    .map((control) => {
      const items = evidence
        .filter((e) => e.controlId === control.id && inPeriod(ctx, e, from, to))
        .sort(byNewest)
      return {
        control: { ...control, documentIds: control.documentIds.filter((id) => visible.has(id)) },
        periodStatus: controlStatusFrom(control.status, items),
        policies: approvedPolicies(ctx, control, docs),
        evidence: items.map((e) => evidenceItem(ctx, e)),
      }
    })

  const count = (s: string) => controls.filter((c) => c.periodStatus === s).length
  return {
    from,
    to,
    generatedAt: ctx.now.toISOString(),
    totals: {
      controls: controls.length,
      passing: count('passing'),
      failing: count('failing'),
      no_evidence: count('no_evidence'),
      evidence: controls.reduce((n, c) => n + c.evidence.length, 0),
    },
    controls,
  }
}

export const auditPackRoutes: RouteDef[] = [
  orgRoute('GET', '/audit-pack', opts, (ctx) => json(buildPack(ctx))),

  // The mock exports a CSV register. The backend returns a zip with the evidence files too.
  orgRoute('GET', '/audit-pack/export', opts, (ctx) => {
    const pack = buildPack(ctx)
    const rows: unknown[][] = []
    for (const c of pack.controls) {
      const policies = c.policies.map((p) => `${p.docId} v${p.version}`).join('; ')
      const lead = [
        FRAMEWORK_LABELS[c.control.framework],
        c.control.reference,
        c.control.title,
        c.periodStatus.replace(/_/g, ' '),
        policies,
      ]
      if (!c.evidence.length) rows.push([...lead, '', '', '', '', ''])
      for (const e of c.evidence) {
        rows.push([
          ...lead,
          collectedOn(ctx, e),
          SOURCE_LABELS[e.source],
          e.result,
          e.summary,
          e.file?.name ?? '',
        ])
      }
    }
    audit(
      ctx,
      'audit_pack.exported',
      { type: 'audit_pack', id: ctx.org.id, label: `${ctx.org.name} audit pack` },
      {
        from: pack.from,
        to: pack.to,
        controls: pack.totals.controls,
        evidence: pack.totals.evidence,
      },
    )
    commit()
    const period = `${pack.from ?? 'start'}_to_${pack.to ?? 'today'}`
    return csvResponse(
      `audit-pack-${ctx.org.slug}-${period}.csv`,
      [
        'Framework',
        'Control',
        'Title',
        'Status in period',
        'Approved policies',
        'Evidence date',
        'Source',
        'Result',
        'Summary',
        'File',
      ],
      rows,
    )
  }),
]
