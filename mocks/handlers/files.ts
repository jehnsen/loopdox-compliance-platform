import type { Risk } from '@/lib/api/types'
import { uploadProblem } from '@/lib/files'
import { createRiskSchema } from '@/lib/schemas/privacy'
import { addMonthsToDate, todayInTz } from '@/lib/utils/dates'
import { audit } from '@/mocks/audit'
import { baseFields, touch } from '@/mocks/helpers'
import { forbidden, HttpError, json, notFound, parse } from '@/mocks/http'
import { assertMember, canSeePrivacy, nextRef } from '@/mocks/privacy'
import { orgRoute, type RouteDef } from '@/mocks/router'
import { commit, newId, type MockFile } from '@/mocks/store'

/** Uploads (metadata only in mock mode) and risks created from incidents (register UI in M5). */

export const fileRoutes: RouteDef[] = [
  orgRoute('POST', '/files', {}, async (ctx) => {
    if (!ctx.can('privacy.edit') && !ctx.can('security.edit') && !ctx.can('evidence.edit')) {
      throw forbidden()
    }
    const form = await ctx.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      throw new HttpError(400, 'validation_error', 'Choose a file to upload.', {
        file: 'Choose a file.',
      })
    }
    const problem = uploadProblem(file)
    if (problem) throw new HttpError(400, 'validation_error', problem, { file: problem })
    // Mock mode keeps the metadata only; GET /files/:id returns a placeholder.
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
    commit()
    const { orgId: _orgId, ...ref } = stored
    return json(ref, 201)
  }),

  orgRoute('GET', '/files/:id', {}, (ctx) => {
    const f = ctx.db.files.find((x) => x.id === ctx.params.id && x.orgId === ctx.org.id)
    if (!f) throw notFound('File')
    const body = `Mock mode keeps no file contents.\n\nFile: ${f.name}\nSize: ${f.size} bytes\nUploaded: ${f.uploadedAt}\n`
    return new Response(body, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${f.name.replace(/"/g, '')}.txt"`,
      },
    })
  }),

  orgRoute('POST', '/risks', { permission: 'security.edit', feature: 'security' }, async (ctx) => {
    const input = parse(createRiskSchema, await ctx.json())
    assertMember(ctx, input.owner, 'owner')
    const incident = input.incidentId
      ? ctx.db.incidents.find((i) => i.orgId === ctx.org.id && i.id === input.incidentId)
      : undefined
    if (input.incidentId) {
      if (!incident || !canSeePrivacy(ctx, incident.status === 'closed')) throw notFound('Incident')
      if (!ctx.can('privacy.edit')) throw forbidden()
    }
    const score = input.likelihood * input.impact
    const risk: Risk = {
      ...baseFields(ctx, 'risk'),
      ref: nextRef(
        ctx.db.risks.filter((r) => r.orgId === ctx.org.id).map((r) => r.ref),
        'RISK',
      ),
      title: input.title,
      description: input.description,
      likelihood: input.likelihood,
      impact: input.impact,
      inherentScore: score,
      treatment: 'mitigate',
      residualScore: null,
      owner: input.owner,
      documentIds: [],
      controlIds: [],
      reviewAt: addMonthsToDate(todayInTz(ctx.org.timezone, ctx.now), 3),
      status: 'open',
    }
    ctx.db.risks.push(risk)
    audit(
      ctx,
      'risk.created',
      { type: 'risk', id: risk.id, label: `${risk.ref} ${risk.title}` },
      {
        ...(incident ? { incident: incident.ref } : {}),
      },
    )
    if (incident) {
      incident.riskIds.push(risk.id)
      touch(ctx, incident)
      audit(
        ctx,
        'incident.linked',
        { type: 'incident', id: incident.id, label: `${incident.ref} ${incident.title}` },
        { type: 'risk', id: risk.id, ref: risk.ref, title: risk.title },
      )
    }
    commit()
    return json(risk, 201)
  }),
]
