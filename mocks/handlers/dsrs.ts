import type { DsrDetail, DsrStatus, DsrSummary, FileRef } from '@/lib/api/types'
import {
  addDaysToDate,
  DSR_DUE_SOON_DAYS,
  DSR_STATUS_LABELS,
  DSR_STATUS_ORDER,
  DSR_TYPE_LABELS,
  maskContact,
  maskName,
} from '@/lib/privacy'
import {
  attachFileSchema,
  createDsrSchema,
  dsrTransitionSchema,
  revealSchema,
  updateDsrSchema,
} from '@/lib/schemas/privacy'
import { audit } from '@/mocks/audit'
import { baseFields, notify, touch, userName } from '@/mocks/helpers'
import { checkVersion, HttpError, json, notFound, paginate, parse } from '@/mocks/http'
import {
  assertMember,
  canSeePrivacy,
  dueState,
  nextYearlyRef,
  today,
  unprocessable,
} from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit, newId, type MockDsr } from '@/mocks/store'

const opts = { feature: 'privacy' as const }
const OPEN: DsrStatus[] = ['received', 'identity_verified', 'in_progress']

function orgDsrs(ctx: OrgCtx): MockDsr[] {
  return ctx.db.dsrs.filter((d) => d.orgId === ctx.org.id)
}

function filesOf(ctx: OrgCtx, ids: string[]): FileRef[] {
  return ids.flatMap((id) => {
    const f = ctx.db.files.find((x) => x.id === id && x.orgId === ctx.org.id)
    if (!f) return []
    const { orgId: _orgId, ...ref } = f
    return [ref]
  })
}

/** The requester's details are always masked here; /sensitive/reveal returns them one field at a time. */
function summarize(ctx: OrgCtx, d: MockDsr): DsrSummary {
  const { requester, fileIds, events: _events, ...rest } = d
  const due = dueState(ctx, d.dueAt, DSR_DUE_SOON_DAYS)
  return {
    ...rest,
    requesterName: maskName(requester.name),
    requesterContact: maskContact(requester.contact),
    files: filesOf(ctx, fileIds),
    assigneeName: d.assignee ? userName(ctx.db, d.assignee) : null,
    dueState: OPEN.includes(d.status) ? due.state : null,
    daysLeft: due.days,
  }
}

function detail(ctx: OrgCtx, d: MockDsr): DsrDetail {
  return {
    ...summarize(ctx, d),
    events: d.events.map((e) => ({ ...e, byName: userName(ctx.db, e.by) })),
  }
}

export function findDsr(ctx: OrgCtx, id: string): MockDsr {
  const d = orgDsrs(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!d || !canSeePrivacy(ctx, d.status === 'closed')) throw notFound('Request')
  return d
}

function label(d: MockDsr): string {
  return `${d.ref} ${DSR_TYPE_LABELS[d.type]} request`
}

function href(ctx: OrgCtx, d: MockDsr): string {
  return `/${ctx.org.slug}/privacy/requests/${d.id}`
}

function assertActivities(ctx: OrgCtx, ids: string[]): void {
  const missing = ids.filter(
    (id) => !ctx.db.processingActivities.some((a) => a.orgId === ctx.org.id && a.id === id),
  )
  if (missing.length) {
    throw new HttpError(400, 'validation_error', 'Choose existing processing records.', {
      processingActivityIds: 'One or more processing records don’t exist.',
    })
  }
}

function notifyAssignee(ctx: OrgCtx, d: MockDsr): void {
  if (!d.assignee) return
  notify(
    ctx,
    [d.assignee],
    'deadline_dsr',
    `${d.ref} is assigned to you`,
    `${DSR_TYPE_LABELS[d.type]} request, due ${d.dueAt}.`,
    href(ctx, d),
  )
}

const listOptions = {
  search: (d: DsrSummary) => [d.ref, DSR_TYPE_LABELS[d.type], d.assigneeName],
  defaultSort: 'dueAt',
  filters: {
    status: (d: DsrSummary, v: string[]) => v.includes(d.status),
    type: (d: DsrSummary, v: string[]) => v.includes(d.type),
    assignee: (d: DsrSummary, v: string[]) => v.includes(d.assignee ?? 'none'),
    due: (d: DsrSummary, v: string[]) => v.includes(d.dueState ?? 'done'),
    open: (d: DsrSummary, v: string[]) => (v[0] === 'true' ? OPEN.includes(d.status) : true),
    processingActivityId: (d: DsrSummary, v: string[]) =>
      d.processingActivityIds.some((id) => v.includes(id)),
  },
}

export const dsrRoutes: RouteDef[] = [
  orgRoute('GET', '/dsrs', { ...opts, permission: 'privacy.read' }, (ctx) => {
    const items = orgDsrs(ctx)
      .filter((d) => canSeePrivacy(ctx, d.status === 'closed'))
      .map((d) => summarize(ctx, d))
    return json(paginate(items, ctx.query, listOptions))
  }),

  orgRoute('POST', '/dsrs', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const input = parse(createDsrSchema, await ctx.json())
    if (input.receivedAt > today(ctx)) {
      throw new HttpError(400, 'validation_error', 'Some fields need attention.', {
        receivedAt: 'The received date can’t be in the future.',
      })
    }
    if (input.assignee) assertMember(ctx, input.assignee, 'assignee')
    assertActivities(ctx, input.processingActivityIds)
    const d: MockDsr = {
      ...baseFields(ctx, 'dsr'),
      ref: nextYearlyRef(
        ctx,
        orgDsrs(ctx).map((x) => x.ref),
        'DSR',
      ),
      type: input.type,
      requester: { name: input.requesterName, contact: input.requesterContact },
      channel: input.channel,
      description: input.description,
      receivedAt: input.receivedAt,
      dueAt: addDaysToDate(input.receivedAt, ctx.org.settings.dsrResponseDays),
      identityVerified: false,
      assignee: input.assignee,
      status: 'received',
      outcome: null,
      responseNotes: '',
      processingActivityIds: input.processingActivityIds,
      fileIds: [],
      events: [
        {
          id: newId('dse'),
          status: 'received',
          at: ctx.now.toISOString(),
          by: ctx.user.id,
          note: null,
        },
      ],
    }
    ctx.db.dsrs.push(d)
    // The requester's details stay out of the audit log.
    audit(ctx, 'dsr.created', { type: 'dsr', id: d.id, label: label(d) }, { dueAt: d.dueAt })
    notifyAssignee(ctx, d)
    commit()
    return json(detail(ctx, d), 201)
  }),

  orgRoute('GET', '/dsrs/:id', { ...opts, permission: 'privacy.read' }, (ctx) =>
    json(detail(ctx, findDsr(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/dsrs/:id', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const input = parse(updateDsrSchema, await ctx.json())
    const d = findDsr(ctx, ctx.params.id ?? '')
    checkVersion(d, input.ifVersion)
    if (d.status === 'closed') throw unprocessable('Closed requests can’t be changed.')
    const previousAssignee = d.assignee
    if (input.assignee) assertMember(ctx, input.assignee, 'assignee')
    if (input.type !== undefined) d.type = input.type
    if (input.channel !== undefined) d.channel = input.channel
    if (input.description !== undefined) d.description = input.description
    if (input.assignee !== undefined) d.assignee = input.assignee
    if (input.responseNotes !== undefined) d.responseNotes = input.responseNotes
    touch(ctx, d)
    audit(
      ctx,
      'dsr.updated',
      { type: 'dsr', id: d.id, label: label(d) },
      d.assignee !== previousAssignee ? { assignee: userName(ctx.db, d.assignee) || null } : {},
    )
    if (d.assignee !== previousAssignee) notifyAssignee(ctx, d)
    commit()
    return json(detail(ctx, d))
  }),

  orgRoute('POST', '/dsrs/:id/transition', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const input = parse(dsrTransitionSchema, await ctx.json())
    const d = findDsr(ctx, ctx.params.id ?? '')
    checkVersion(d, input.ifVersion)
    const next = DSR_STATUS_ORDER[DSR_STATUS_ORDER.indexOf(d.status) + 1]
    if (input.status !== next) {
      throw unprocessable(
        next
          ? `This request is ${DSR_STATUS_LABELS[d.status].toLowerCase()}. The next step is “${DSR_STATUS_LABELS[next]}”.`
          : 'This request is already closed.',
      )
    }
    if (input.status === 'identity_verified') d.identityVerified = true
    if (input.status === 'responded') d.outcome = input.outcome ?? null
    d.status = input.status
    d.events.push({
      id: newId('dse'),
      status: input.status,
      at: ctx.now.toISOString(),
      by: ctx.user.id,
      note: input.note || null,
    })
    touch(ctx, d)
    audit(
      ctx,
      `dsr.${input.status}`,
      { type: 'dsr', id: d.id, label: label(d) },
      {
        ...(input.note ? { note: input.note } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
      },
    )
    commit()
    return json(detail(ctx, d))
  }),

  orgRoute('POST', '/dsrs/:id/files', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const { fileId } = parse(attachFileSchema, await ctx.json())
    const d = findDsr(ctx, ctx.params.id ?? '')
    const file = ctx.db.files.find((f) => f.id === fileId && f.orgId === ctx.org.id)
    if (!file) throw notFound('File')
    if (!d.fileIds.includes(fileId)) {
      d.fileIds.push(fileId)
      touch(ctx, d)
      audit(
        ctx,
        'dsr.file_attached',
        { type: 'dsr', id: d.id, label: label(d) },
        { name: file.name },
      )
      commit()
    }
    return json(detail(ctx, d))
  }),

  orgRoute('DELETE', '/dsrs/:id/files/:fileId', { ...opts, permission: 'privacy.edit' }, (ctx) => {
    const d = findDsr(ctx, ctx.params.id ?? '')
    const fileId = ctx.params.fileId ?? ''
    if (d.fileIds.includes(fileId)) {
      const file = ctx.db.files.find((f) => f.id === fileId)
      d.fileIds = d.fileIds.filter((f) => f !== fileId)
      touch(ctx, d)
      audit(
        ctx,
        'dsr.file_removed',
        { type: 'dsr', id: d.id, label: label(d) },
        { name: file?.name },
      )
      commit()
    }
    return json(detail(ctx, d))
  }),

  // Every reveal is audited against the record, naming the field but never the value.
  orgRoute('POST', '/sensitive/reveal', { permission: 'sensitive.reveal' }, async (ctx) => {
    const input = parse(revealSchema, await ctx.json())
    ctx.require('privacy.read')
    const d = findDsr(ctx, input.targetId)
    const value = input.field === 'requesterName' ? d.requester.name : d.requester.contact
    audit(
      ctx,
      'sensitive.revealed',
      { type: 'dsr', id: d.id, label: label(d) },
      { field: input.field },
    )
    commit()
    return json({ value })
  }),
]
