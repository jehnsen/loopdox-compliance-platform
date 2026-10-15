import { fromZonedTime } from 'date-fns-tz'
import type { Evidence, EvidenceResult } from '@/lib/api/types'
import { hasFeature } from '@/lib/entitlements'
import { uploadProblem } from '@/lib/files'
import { uploadEvidenceSchema } from '@/lib/schemas/evidence'
import { todayInTz } from '@/lib/utils/dates'
import { audit } from '@/mocks/audit'
import {
  byNewest,
  evidenceItem,
  orgControls,
  orgEvidence,
  refreshControlStatus,
} from '@/mocks/evidence'
import { searchSources } from '@/mocks/handlers/search'
import { baseFields } from '@/mocks/helpers'
import { HttpError, json, notFound, paginate, parse } from '@/mocks/http'
import { orgRoute, type RouteDef } from '@/mocks/router'
import { commit, newId, type MockFile } from '@/mocks/store'

const opts = { feature: 'evidence' as const }

const evidenceFilters = {
  result: (e: { result: string }, v: string[]) => v.includes(e.result),
  source: (e: { source: string }, v: string[]) => v.includes(e.source),
}

export const evidenceRoutes: RouteDef[] = [
  // A control's evidence timeline, newest first.
  orgRoute('GET', '/controls/:id/evidence', { ...opts, permission: 'evidence.read' }, (ctx) => {
    const control = orgControls(ctx).find((c) => c.id === ctx.params.id)
    if (!control) throw notFound('Control')
    const items = orgEvidence(ctx)
      .filter((e) => e.controlId === control.id)
      .map((e) => evidenceItem(ctx, e))
    return json(
      paginate(items, ctx.query, {
        search: (e) => [e.summary, e.connectorName, e.origin?.label, e.file?.name],
        defaultSort: '-collectedAt',
        filters: evidenceFilters,
      }),
    )
  }),

  // Every evidence item in the organisation: the Uploads page and exports read this.
  orgRoute('GET', '/evidence', { ...opts, permission: 'evidence.read' }, (ctx) => {
    const items = orgEvidence(ctx).map((e) => evidenceItem(ctx, e))
    return json(
      paginate(items, ctx.query, {
        search: (e) => [
          e.summary,
          e.controlReference,
          e.controlTitle,
          e.connectorName,
          e.file?.name,
          e.collectedByName,
        ],
        defaultSort: '-collectedAt',
        filters: {
          ...evidenceFilters,
          controlId: (e, v) => v.includes(e.controlId),
        },
      }),
    )
  }),

  /**
   * Upload evidence (multipart: `file` plus the fields of `uploadEvidenceSchema`). The
   * file is stored first, then an evidence item points at it. The control is judged
   * again from its evidence, so a failing upload turns a passing control red.
   */
  orgRoute('POST', '/evidence', { ...opts, permission: 'evidence.edit' }, async (ctx) => {
    const form = await ctx.req.formData().catch(() => null)
    if (!form) {
      throw new HttpError(400, 'validation_error', 'Send the evidence as a multipart form.')
    }
    const text = (name: string) => {
      const v = form.get(name)
      return typeof v === 'string' && v !== '' ? v : undefined
    }
    const fields = parse(uploadEvidenceSchema, {
      controlId: text('controlId'),
      summary: text('summary'),
      result: text('result'),
      collectedOn: text('collectedOn'),
    })
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new HttpError(400, 'validation_error', 'Choose a file to upload.', {
        file: 'Choose a file.',
      })
    }
    const problem = uploadProblem(file)
    if (problem) throw new HttpError(400, 'validation_error', problem, { file: problem })

    const control = orgControls(ctx).find((c) => c.id === fields.controlId)
    if (!control) {
      throw new HttpError(400, 'validation_error', 'That control doesn’t exist.', {
        controlId: 'Choose a control from the list.',
      })
    }
    const today = todayInTz(ctx.org.timezone, ctx.now)
    if (fields.collectedOn && fields.collectedOn > today) {
      throw new HttpError(400, 'validation_error', 'Evidence can’t be dated in the future.', {
        collectedOn: 'Choose today or an earlier date.',
      })
    }
    // Today means "now"; an earlier day is recorded at midday that day, in the tenant's timezone.
    const collectedAt =
      !fields.collectedOn || fields.collectedOn === today
        ? ctx.now.toISOString()
        : fromZonedTime(`${fields.collectedOn}T12:00:00`, ctx.org.timezone).toISOString()

    // The mock keeps metadata only, like POST /files.
    const stored: MockFile = {
      id: newId('file'),
      orgId: ctx.org.id,
      name: file.name,
      size: file.size,
      contentType: file.type,
      uploadedAt: ctx.now.toISOString(),
      uploadedBy: ctx.user.id,
    }
    ctx.db.files.push(stored)

    const evidence: Evidence = {
      ...baseFields(ctx, 'evd'),
      controlId: control.id,
      source: 'upload',
      connectorId: null,
      collectedAt,
      result: fields.result as EvidenceResult,
      summary: fields.summary,
      fileId: stored.id,
      origin: null,
    }
    ctx.db.evidence.push(evidence)
    refreshControlStatus(ctx, control.id)
    audit(
      ctx,
      'evidence.uploaded',
      { type: 'control', id: control.id, label: `${control.reference} ${control.title}` },
      { result: fields.result, file: file.name },
    )
    commit()
    return json(evidenceItem(ctx, evidence), 201)
  }),
]

// Evidence is searchable by what it says, the control it belongs to and its file name.
searchSources.push({
  type: 'evidence',
  label: 'Evidence',
  items: (ctx) => {
    if (!hasFeature(ctx.org.tier, 'evidence') || !ctx.can('evidence.read')) return []
    return orgEvidence(ctx)
      .sort(byNewest)
      .map((e) => {
        const item = evidenceItem(ctx, e)
        return {
          type: 'evidence' as const,
          id: e.id,
          ref: item.controlReference,
          title: item.summary.length > 100 ? `${item.summary.slice(0, 97)}…` : item.summary,
          href: `/${ctx.org.slug}/evidence/controls/${e.controlId}#${e.id}`,
          snippet: null,
          text: `${item.summary} ${item.controlTitle} ${item.connectorName ?? ''} ${item.file?.name ?? ''}`,
        }
      })
  },
})
