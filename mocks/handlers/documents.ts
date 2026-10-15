import type {
  Acknowledgement,
  AcknowledgementStatus,
  Document,
  DocumentDetail,
  DocumentLookupItem,
  DocumentSummary,
  DocumentVersion,
  DocumentVersionSummary,
  ReviewState,
  WorkflowEvent,
} from '@/lib/api/types'
import { can } from '@/lib/auth/permissions'
import {
  createDocumentSchema,
  rejectSchema,
  reorderSchema,
  restoreSchema,
  updateDocumentSchema,
  workflowNoteSchema,
} from '@/lib/schemas/documents'
import { addMonthsToDate, daysUntil, todayInTz } from '@/lib/utils/dates'
import { nextSeq } from '@/lib/utils/ids'
import { audit } from '@/mocks/audit'
import { activeMembers, csvCell, membersWith, notify, touch, userName } from '@/mocks/helpers'
import {
  checkVersion,
  forbidden,
  HttpError,
  json,
  noContent,
  notFound,
  paginate,
  parse,
} from '@/mocks/http'
import { searchSources } from '@/mocks/handlers/search'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit, newId, type MockDB, type MockDocumentVersion } from '@/mocks/store'

// ---------------------------------------------------------------------------
// Visibility and projection
// ---------------------------------------------------------------------------

function readsDrafts(ctx: OrgCtx): boolean {
  return ctx.can('policies.read_drafts')
}

/**
 * What a caller may see. People without `policies.read_drafts` see only documents
 * with an approved version, projected as that approved version.
 */
function project(ctx: OrgCtx, doc: Document): Document | null {
  if (readsDrafts(ctx)) return doc
  if (doc.approvedVersion === null || doc.status === 'retired') return null
  return { ...doc, status: 'approved', currentVersion: doc.approvedVersion }
}

function orgDocs(ctx: OrgCtx): Document[] {
  return ctx.db.documents.filter((d) => d.orgId === ctx.org.id)
}

export function visibleDocs(ctx: OrgCtx): Document[] {
  return orgDocs(ctx).flatMap((d) => project(ctx, d) ?? [])
}

export function reviewStateOf(ctx: OrgCtx, doc: Document): ReviewState | null {
  if (doc.approvedVersion === null || doc.status === 'retired' || !doc.nextReviewDate) return null
  const days = daysUntil(doc.nextReviewDate, ctx.org.timezone, ctx.now)
  if (days < 0) return 'overdue'
  if (days <= ctx.org.settings.reviewReminderLeadDays) return 'due_soon'
  return 'ok'
}

function summarize(ctx: OrgCtx, doc: Document, visible: Document[]): DocumentSummary {
  return {
    ...doc,
    ownerName: userName(ctx.db, doc.owner),
    approvedByName: doc.approvedBy ? userName(ctx.db, doc.approvedBy) : null,
    updatedByName: userName(ctx.db, doc.updatedBy),
    reviewState: reviewStateOf(ctx, doc),
    childCount: visible.filter((d) => d.parentId === doc.id).length,
  }
}

function findStored(ctx: OrgCtx, idOrDocId: string): Document {
  const key = idOrDocId.toUpperCase()
  const doc = orgDocs(ctx).find((d) => d.id === idOrDocId || d.docId === key)
  if (!doc) throw notFound('Document')
  return doc
}

/** The stored document, if the caller can see it (404 otherwise). */
function findVisible(ctx: OrgCtx, idOrDocId: string): { stored: Document; doc: Document } {
  ctx.require('policies.read')
  const stored = findStored(ctx, idOrDocId)
  const doc = project(ctx, stored)
  if (!doc) throw notFound('Document')
  return { stored, doc }
}

function storedVersion(
  ctx: OrgCtx,
  documentId: string,
  version: number,
): MockDocumentVersion | undefined {
  return ctx.db.documentVersions.find((v) => v.documentId === documentId && v.version === version)
}

function toVersion(db: MockDB, v: MockDocumentVersion): DocumentVersion {
  const { orgId: _orgId, ...rest } = v
  return { ...rest, authorName: userName(db, v.author) }
}

function toVersionSummary(db: MockDB, v: MockDocumentVersion): DocumentVersionSummary {
  const { bodyMarkdown: _body, ...rest } = toVersion(db, v)
  return rest
}

function workflowFor(ctx: OrgCtx, documentId: string): WorkflowEvent[] {
  return ctx.db.workflowEvents
    .filter((w) => w.documentId === documentId)
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((w) => ({ ...w, actorName: userName(ctx.db, w.actor) }))
}

function detail(ctx: OrgCtx, stored: Document): DocumentDetail {
  const doc = project(ctx, stored)
  if (!doc) throw notFound('Document')
  const visible = visibleDocs(ctx)
  const contentVersion = readsDrafts(ctx) ? doc.currentVersion : doc.approvedVersion
  const content = contentVersion ? storedVersion(ctx, doc.id, contentVersion) : undefined
  const ack = doc.approvedVersion
    ? ctx.db.acknowledgements.find(
        (a) =>
          a.documentId === doc.id && a.version === doc.approvedVersion && a.userId === ctx.user.id,
      )
    : undefined
  return {
    ...summarize(ctx, doc, visible),
    content: content ? toVersion(ctx.db, content) : null,
    children: visible
      .filter((d) => d.parentId === doc.id)
      .sort((a, b) => a.order - b.order)
      .map((d) => summarize(ctx, d, visible)),
    workflow: readsDrafts(ctx) ? workflowFor(ctx, doc.id) : [],
    acknowledgedByMe: Boolean(ack),
    acknowledgedAt: ack?.at ?? null,
  }
}

// ---------------------------------------------------------------------------
// Helpers for writes
// ---------------------------------------------------------------------------

function today(ctx: OrgCtx): string {
  return todayInTz(ctx.org.timezone, ctx.now)
}

/** Sets the approval fields: effective today (tenant timezone), next review = today + cycle. */
function markApproved(ctx: OrgCtx, doc: Document): void {
  const effective = today(ctx)
  doc.status = 'approved'
  doc.approvedVersion = doc.currentVersion
  doc.approvedBy = ctx.user.id
  doc.approvedAt = ctx.now.toISOString()
  doc.effectiveDate = effective
  doc.nextReviewDate = addMonthsToDate(effective, doc.reviewCycleMonths)
}

function addWorkflow(
  ctx: OrgCtx,
  doc: Document,
  type: WorkflowEvent['type'],
  note: string | null,
): void {
  ctx.db.workflowEvents.push({
    id: newId('wfe'),
    documentId: doc.id,
    version: doc.currentVersion,
    type,
    actor: ctx.user.id,
    note,
    at: ctx.now.toISOString(),
  })
}

function docHref(ctx: OrgCtx, doc: Document): string {
  return `/${ctx.org.slug}/policies/${doc.id}`
}

function label(doc: Document): string {
  return `${doc.docId} ${doc.title}`
}

function assertDocIdFree(ctx: OrgCtx, docId: string, exceptId?: string): void {
  const taken = orgDocs(ctx).find((d) => d.docId === docId && d.id !== exceptId)
  if (taken) {
    throw new HttpError(400, 'validation_error', 'That document ID is already used.', {
      docId: `${docId} is already used by “${taken.title}”.`,
    })
  }
}

function assertParent(ctx: OrgCtx, parentId: string | null, selfId?: string): void {
  if (parentId === null) return
  const docs = orgDocs(ctx)
  if (!docs.some((d) => d.id === parentId)) {
    throw new HttpError(400, 'validation_error', 'The parent page doesn’t exist.', {
      parentId: 'Choose an existing page.',
    })
  }
  // A page can't move under itself or one of its descendants.
  let cursor: string | null = parentId
  while (cursor) {
    if (cursor === selfId) {
      throw new HttpError(400, 'validation_error', 'A page can’t be placed under itself.', {
        parentId: 'Choose a page that isn’t this one or one of its children.',
      })
    }
    cursor = docs.find((d) => d.id === cursor)?.parentId ?? null
  }
}

function assertOwner(ctx: OrgCtx, owner: string): void {
  if (
    !activeMembers(ctx).some((m) => m.userId === owner && !m.roles.every((r) => r === 'auditor'))
  ) {
    throw new HttpError(
      400,
      'validation_error',
      'The owner must be a member of this organisation.',
      {
        owner: 'Choose a current member.',
      },
    )
  }
}

function addVersion(
  ctx: OrgCtx,
  doc: Document,
  title: string,
  body: string,
  changeSummary: string,
  type: MockDocumentVersion['type'],
  restoredFrom: number | null = null,
): MockDocumentVersion {
  const v: MockDocumentVersion = {
    id: newId('ver'),
    orgId: ctx.org.id,
    documentId: doc.id,
    version: doc.currentVersion + (type === 'create' ? 0 : 1),
    title,
    bodyMarkdown: body,
    changeSummary,
    type,
    restoredFrom,
    author: ctx.user.id,
    createdAt: ctx.now.toISOString(),
  }
  ctx.db.documentVersions.push(v)
  doc.currentVersion = v.version
  doc.title = title
  return v
}

/** After new content: back to draft, or published straight away when no approval is needed. */
function afterContentChange(ctx: OrgCtx, doc: Document): void {
  if (doc.requiresApproval) doc.status = 'draft'
  else markApproved(ctx, doc)
}

// ---------------------------------------------------------------------------
// List filters (shared by list and export)
// ---------------------------------------------------------------------------

function listDocs(ctx: OrgCtx): DocumentSummary[] {
  const visible = visibleDocs(ctx)
  return visible.map((d) => summarize(ctx, d, visible))
}

const listOptions = (ctx: OrgCtx) => ({
  search: (d: DocumentSummary) => [d.docId, d.title, d.ownerName],
  defaultSort: 'docId',
  filters: {
    status: (d: DocumentSummary, v: string[]) => v.includes(d.status),
    owner: (d: DocumentSummary, v: string[]) => v.includes(d.owner),
    review: (d: DocumentSummary, v: string[]) => v.includes(d.reviewState ?? 'none'),
    parent: (d: DocumentSummary, v: string[]) => v.includes(d.parentId ?? 'root'),
    framework: (d: DocumentSummary, v: string[]) =>
      ctx.db.controls.some((c) => d.controlIds.includes(c.id) && v.includes(c.framework)),
    ack: (d: DocumentSummary, v: string[]) => {
      if (d.approvedVersion === null || d.status === 'retired' || !d.requiresApproval) return false
      const done = ctx.db.acknowledgements.some(
        (a) => a.documentId === d.id && a.version === d.approvedVersion && a.userId === ctx.user.id,
      )
      return v.includes(done ? 'done' : 'pending')
    },
  },
})

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const documentRoutes: RouteDef[] = [
  orgRoute('GET', '/documents', { permission: 'policies.read', feature: 'policies' }, (ctx) =>
    json(paginate(listDocs(ctx), ctx.query, listOptions(ctx))),
  ),

  orgRoute(
    'GET',
    '/documents/lookup',
    { permission: 'policies.read', feature: 'policies' },
    (ctx) => {
      const items: DocumentLookupItem[] = visibleDocs(ctx)
        .map((d) => ({
          id: d.id,
          docId: d.docId,
          title: d.title,
          status: d.status,
          parentId: d.parentId,
          order: d.order,
          reviewState: reviewStateOf(ctx, d),
        }))
        .sort((a, b) => a.order - b.order || a.docId.localeCompare(b.docId))
      return json({ items })
    },
  ),

  orgRoute(
    'GET',
    '/documents/next-id',
    { permission: 'policies.edit', feature: 'policies' },
    (ctx) => {
      const ids = orgDocs(ctx).map((d) => d.docId)
      let prefix = ctx.query.get('prefix')?.toUpperCase()
      if (!prefix) {
        // Most common prefix among existing documents, ignoring section pages.
        const counts = new Map<string, number>()
        for (const id of ids) {
          const p = id.split('-')[0] ?? ''
          if (p !== 'SEC') counts.set(p, (counts.get(p) ?? 0) + 1)
        }
        prefix = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'DOC'
      }
      return json({ docId: `${prefix}-${String(nextSeq(ids, prefix)).padStart(3, '0')}` })
    },
  ),

  orgRoute(
    'GET',
    '/documents/export',
    { permission: 'policies.read', feature: 'policies' },
    (ctx) => {
      const all = paginate(
        listDocs(ctx),
        new URLSearchParams([...ctx.query, ['page', '1'], ['pageSize', '200']]),
        listOptions(ctx),
      )
      const header = [
        'ID',
        'Title',
        'Status',
        'Owner',
        'Version',
        'Approved version',
        'Effective',
        'Next review',
        'Last edited',
      ]
      const rows = all.items.map((d) =>
        [
          d.docId,
          d.title,
          d.status,
          d.ownerName,
          d.currentVersion,
          d.approvedVersion,
          d.effectiveDate,
          d.nextReviewDate,
          d.updatedAt,
        ]
          .map(csvCell)
          .join(','),
      )
      const csv = [header.join(','), ...rows].join('\n')
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="policies-${ctx.org.slug}-${today(ctx)}.csv"`,
        },
      })
    },
  ),

  orgRoute(
    'POST',
    '/documents',
    { permission: 'policies.edit', feature: 'policies' },
    async (ctx) => {
      const input = parse(createDocumentSchema, await ctx.json())
      assertDocIdFree(ctx, input.docId)
      assertParent(ctx, input.parentId)
      assertOwner(ctx, input.owner)
      const siblings = orgDocs(ctx).filter((d) => d.parentId === input.parentId)
      const at = ctx.now.toISOString()
      const doc: Document = {
        id: newId('doc'),
        orgId: ctx.org.id,
        createdAt: at,
        updatedAt: at,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
        version: 1,
        docId: input.docId,
        title: input.title,
        parentId: input.parentId,
        order: siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0,
        owner: input.owner,
        requiresApproval: input.requiresApproval,
        reviewCycleMonths: input.reviewCycleMonths,
        status: 'draft',
        currentVersion: 1,
        approvedVersion: null,
        effectiveDate: null,
        nextReviewDate: null,
        approvedBy: null,
        approvedAt: null,
        classification: input.classification,
        controlIds: [],
      }
      ctx.db.documents.push(doc)
      addVersion(ctx, doc, input.title, input.bodyMarkdown, input.changeSummary, 'create')
      if (!doc.requiresApproval) markApproved(ctx, doc)
      audit(
        ctx,
        'document.created',
        { type: 'document', id: doc.id, label: label(doc) },
        { version: 1 },
      )
      commit()
      return json(detail(ctx, doc), 201)
    },
  ),

  orgRoute(
    'POST',
    '/documents/reorder',
    { permission: 'policies.edit', feature: 'policies' },
    async (ctx) => {
      const { parentId, orderedIds } = parse(reorderSchema, await ctx.json())
      const docs = orderedIds.map((id) => findStored(ctx, id))
      for (const doc of docs) assertParent(ctx, parentId, doc.id)
      docs.forEach((doc, i) => {
        if (doc.parentId !== parentId) {
          audit(
            ctx,
            'document.moved',
            { type: 'document', id: doc.id, label: label(doc) },
            { from: doc.parentId, to: parentId },
          )
        }
        doc.parentId = parentId
        doc.order = i
      })
      commit()
      return noContent()
    },
  ),

  orgRoute('GET', '/documents/:id', { feature: 'policies' }, (ctx) => {
    const { stored } = findVisible(ctx, ctx.params.id ?? '')
    return json(detail(ctx, stored))
  }),

  orgRoute(
    'PATCH',
    '/documents/:id',
    { permission: 'policies.edit', feature: 'policies' },
    async (ctx) => {
      const input = parse(updateDocumentSchema, await ctx.json())
      const doc = findStored(ctx, ctx.params.id ?? '')
      if (doc.status === 'retired') {
        throw new HttpError(422, 'unprocessable', 'Retired documents can’t be edited.')
      }
      checkVersion(doc, input.ifVersion)
      if (input.docId !== undefined && input.docId !== doc.docId)
        assertDocIdFree(ctx, input.docId, doc.id)
      if (input.parentId !== undefined) assertParent(ctx, input.parentId, doc.id)
      if (input.owner !== undefined) assertOwner(ctx, input.owner)

      const current = storedVersion(ctx, doc.id, doc.currentVersion)
      const title = input.title ?? doc.title
      const body = input.bodyMarkdown ?? current?.bodyMarkdown ?? ''
      const contentChanged = title !== doc.title || body !== (current?.bodyMarkdown ?? '')

      if (input.docId !== undefined) doc.docId = input.docId
      if (input.parentId !== undefined && input.parentId !== doc.parentId) {
        const siblings = orgDocs(ctx).filter((d) => d.parentId === input.parentId)
        doc.parentId = input.parentId
        doc.order = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0
      }
      if (input.owner !== undefined) doc.owner = input.owner
      if (input.classification !== undefined) doc.classification = input.classification
      if (input.requiresApproval !== undefined) doc.requiresApproval = input.requiresApproval
      if (
        input.reviewCycleMonths !== undefined &&
        input.reviewCycleMonths !== doc.reviewCycleMonths
      ) {
        doc.reviewCycleMonths = input.reviewCycleMonths
        if (doc.effectiveDate)
          doc.nextReviewDate = addMonthsToDate(doc.effectiveDate, doc.reviewCycleMonths)
      }

      const target = { type: 'document', id: doc.id, label: label(doc) }
      if (contentChanged) {
        const from = doc.status
        addVersion(ctx, doc, title, body, input.changeSummary ?? 'Update.', 'edit')
        afterContentChange(ctx, doc)
        audit(ctx, 'document.edited', target, {
          version: doc.currentVersion,
          statusFrom: from,
          statusTo: doc.status,
        })
      } else {
        audit(ctx, 'document.updated', target, {})
      }
      touch(ctx, doc)
      commit()
      return json(detail(ctx, doc))
    },
  ),

  orgRoute(
    'DELETE',
    '/documents/:id',
    { permission: 'policies.edit', feature: 'policies' },
    (ctx) => {
      const doc = findStored(ctx, ctx.params.id ?? '')
      if (doc.approvedVersion !== null) {
        throw new HttpError(
          422,
          'unprocessable',
          'Only drafts that were never approved can be deleted. Retire it instead.',
        )
      }
      if (orgDocs(ctx).some((d) => d.parentId === doc.id)) {
        throw new HttpError(422, 'unprocessable', 'Move or delete the pages under this one first.')
      }
      ctx.db.documents = ctx.db.documents.filter((d) => d.id !== doc.id)
      ctx.db.documentVersions = ctx.db.documentVersions.filter((v) => v.documentId !== doc.id)
      ctx.db.workflowEvents = ctx.db.workflowEvents.filter((w) => w.documentId !== doc.id)
      audit(ctx, 'document.deleted', { type: 'document', id: doc.id, label: label(doc) })
      commit()
      return noContent()
    },
  ),

  orgRoute('GET', '/documents/:id/versions', { feature: 'policies' }, (ctx) => {
    const { doc } = findVisible(ctx, ctx.params.id ?? '')
    const versions = ctx.db.documentVersions
      .filter(
        (v) => v.documentId === doc.id && (readsDrafts(ctx) || v.version <= doc.currentVersion),
      )
      .map((v) => toVersionSummary(ctx.db, v))
    return json(paginate(versions, ctx.query, { defaultSort: '-version' }))
  }),

  orgRoute('GET', '/documents/:id/versions/:v', { feature: 'policies' }, (ctx) => {
    const { doc } = findVisible(ctx, ctx.params.id ?? '')
    const n = Number(ctx.params.v)
    // Read-only roles can see approved history up to the approved version, not later drafts.
    if (!Number.isInteger(n) || (!readsDrafts(ctx) && n > doc.currentVersion))
      throw notFound('Version')
    const v = storedVersion(ctx, doc.id, n)
    if (!v) throw notFound('Version')
    return json(toVersion(ctx.db, v))
  }),

  orgRoute(
    'POST',
    '/documents/:id/submit',
    { permission: 'policies.edit', feature: 'policies' },
    async (ctx) => {
      const { note, ifVersion } = parse(workflowNoteSchema, await ctx.json())
      const doc = findStored(ctx, ctx.params.id ?? '')
      if (ifVersion !== undefined) checkVersion(doc, ifVersion)
      if (doc.status !== 'draft')
        throw new HttpError(422, 'unprocessable', 'Only drafts can be submitted for review.')
      if (!doc.requiresApproval)
        throw new HttpError(
          422,
          'unprocessable',
          'This page doesn’t need approval; saving publishes it.',
        )
      doc.status = 'in_review'
      addWorkflow(ctx, doc, 'submit', note || null)
      touch(ctx, doc)
      audit(
        ctx,
        'document.submitted',
        { type: 'document', id: doc.id, label: label(doc) },
        { version: doc.currentVersion, ...(note ? { note } : {}) },
      )
      notify(
        ctx,
        membersWith(ctx, 'policies.approve'),
        'approval_requested',
        `${label(doc)} is ready for your decision`,
        `${ctx.user.name} submitted v${doc.currentVersion} for approval.`,
        docHref(ctx, doc),
      )
      commit()
      return json(detail(ctx, doc))
    },
  ),

  orgRoute(
    'POST',
    '/documents/:id/approve',
    { permission: 'policies.approve', feature: 'policies' },
    async (ctx) => {
      const { note, ifVersion } = parse(workflowNoteSchema, await ctx.json())
      const doc = findStored(ctx, ctx.params.id ?? '')
      if (ifVersion !== undefined) checkVersion(doc, ifVersion)
      if (doc.status !== 'in_review')
        throw new HttpError(422, 'unprocessable', 'Only documents in review can be approved.')
      markApproved(ctx, doc)
      addWorkflow(ctx, doc, 'approve', note || null)
      touch(ctx, doc)
      audit(
        ctx,
        'document.approved',
        { type: 'document', id: doc.id, label: label(doc) },
        {
          version: doc.currentVersion,
          effectiveDate: doc.effectiveDate,
          nextReviewDate: doc.nextReviewDate,
        },
      )
      notify(
        ctx,
        [doc.owner],
        'approval_decided',
        `${label(doc)} v${doc.currentVersion} was approved`,
        `Approved by ${ctx.user.name}. It takes effect today.`,
        docHref(ctx, doc),
      )
      notify(
        ctx,
        membersWith(ctx, 'policies.acknowledge'),
        'deadline_review',
        `Please acknowledge ${label(doc)}`,
        `v${doc.currentVersion} was approved. Read it and confirm you understand it.`,
        docHref(ctx, doc),
      )
      commit()
      return json(detail(ctx, doc))
    },
  ),

  orgRoute(
    'POST',
    '/documents/:id/reject',
    { permission: 'policies.approve', feature: 'policies' },
    async (ctx) => {
      const { note, ifVersion } = parse(rejectSchema, await ctx.json())
      const doc = findStored(ctx, ctx.params.id ?? '')
      if (ifVersion !== undefined) checkVersion(doc, ifVersion)
      if (doc.status !== 'in_review')
        throw new HttpError(422, 'unprocessable', 'Only documents in review can be sent back.')
      doc.status = 'draft'
      addWorkflow(ctx, doc, 'reject', note)
      touch(ctx, doc)
      audit(
        ctx,
        'document.changes_requested',
        { type: 'document', id: doc.id, label: label(doc) },
        { version: doc.currentVersion, note },
      )
      notify(
        ctx,
        [doc.owner],
        'approval_decided',
        `Changes requested on ${label(doc)}`,
        note,
        docHref(ctx, doc),
      )
      commit()
      return json(detail(ctx, doc))
    },
  ),

  orgRoute(
    'POST',
    '/documents/:id/restore',
    { permission: 'policies.edit', feature: 'policies' },
    async (ctx) => {
      const input = parse(restoreSchema, await ctx.json())
      const doc = findStored(ctx, ctx.params.id ?? '')
      if (doc.status === 'retired')
        throw new HttpError(422, 'unprocessable', 'Retired documents can’t be edited.')
      checkVersion(doc, input.ifVersion)
      const source = storedVersion(ctx, doc.id, input.version)
      if (!source) throw notFound('Version')
      if (input.version === doc.currentVersion) {
        throw new HttpError(
          422,
          'unprocessable',
          `v${input.version} is already the current version.`,
        )
      }
      addVersion(
        ctx,
        doc,
        source.title,
        source.bodyMarkdown,
        input.changeSummary || `Restored from v${input.version}.`,
        'restore',
        input.version,
      )
      afterContentChange(ctx, doc)
      touch(ctx, doc)
      audit(
        ctx,
        'document.restored',
        { type: 'document', id: doc.id, label: label(doc) },
        { version: doc.currentVersion, restoredFrom: input.version },
      )
      commit()
      return json(detail(ctx, doc))
    },
  ),

  orgRoute(
    'POST',
    '/documents/:id/retire',
    { permission: 'policies.approve', feature: 'policies' },
    async (ctx) => {
      const { note, ifVersion } = parse(workflowNoteSchema, await ctx.json())
      const doc = findStored(ctx, ctx.params.id ?? '')
      if (ifVersion !== undefined) checkVersion(doc, ifVersion)
      if (doc.status === 'retired')
        throw new HttpError(422, 'unprocessable', 'This document is already retired.')
      doc.status = 'retired'
      addWorkflow(ctx, doc, 'retire', note || null)
      touch(ctx, doc)
      audit(
        ctx,
        'document.retired',
        { type: 'document', id: doc.id, label: label(doc) },
        note ? { note } : {},
      )
      commit()
      return json(detail(ctx, doc))
    },
  ),

  orgRoute(
    'GET',
    '/documents/:id/acknowledgements',
    { permission: 'policies.read_drafts', feature: 'policies' },
    (ctx) => {
      const doc = findStored(ctx, ctx.params.id ?? '')
      const version = doc.status === 'retired' ? null : doc.approvedVersion
      const required = activeMembers(ctx).filter((m) =>
        can({ roles: m.roles }, 'policies.acknowledge'),
      )
      const members = required.map((m) => {
        const user = ctx.db.users.find((u) => u.id === m.userId)
        const ack = version
          ? ctx.db.acknowledgements.find(
              (a) => a.documentId === doc.id && a.version === version && a.userId === m.userId,
            )
          : undefined
        return {
          userId: m.userId,
          name: user?.name ?? 'Former member',
          title: user?.title ?? null,
          roles: m.roles,
          acknowledgedAt: ack?.at ?? null,
        }
      })
      members.sort(
        (a, b) =>
          Number(Boolean(a.acknowledgedAt)) - Number(Boolean(b.acknowledgedAt)) ||
          a.name.localeCompare(b.name),
      )
      const body: AcknowledgementStatus = {
        documentId: doc.id,
        version,
        required: members.length,
        acknowledged: members.filter((m) => m.acknowledgedAt).length,
        members,
      }
      return json(body)
    },
  ),

  orgRoute(
    'POST',
    '/documents/:id/acknowledgements',
    { permission: 'policies.acknowledge', feature: 'policies' },
    (ctx) => {
      const { doc } = findVisible(ctx, ctx.params.id ?? '')
      if (doc.approvedVersion === null || doc.status === 'retired') {
        throw new HttpError(422, 'unprocessable', 'There’s no approved version to acknowledge yet.')
      }
      let ack = ctx.db.acknowledgements.find(
        (a) =>
          a.documentId === doc.id && a.version === doc.approvedVersion && a.userId === ctx.user.id,
      )
      if (!ack) {
        ack = {
          id: newId('ack'),
          documentId: doc.id,
          version: doc.approvedVersion,
          userId: ctx.user.id,
          at: ctx.now.toISOString(),
        }
        ctx.db.acknowledgements.push(ack)
        audit(
          ctx,
          'document.acknowledged',
          { type: 'document', id: doc.id, label: label(doc) },
          { version: doc.approvedVersion },
        )
        commit()
      }
      return json<Acknowledgement>(ack, 201)
    },
  ),

  orgRoute('POST', '/documents/:id/acknowledgements/remind', { feature: 'policies' }, (ctx) => {
    if (!ctx.can('policies.edit') && !ctx.can('policies.approve')) throw forbidden()
    const doc = findStored(ctx, ctx.params.id ?? '')
    if (doc.approvedVersion === null || doc.status === 'retired') {
      throw new HttpError(422, 'unprocessable', 'There’s no approved version to acknowledge yet.')
    }
    const pending = activeMembers(ctx)
      .filter((m) => can({ roles: m.roles }, 'policies.acknowledge'))
      .filter(
        (m) =>
          !ctx.db.acknowledgements.some(
            (a) =>
              a.documentId === doc.id && a.version === doc.approvedVersion && a.userId === m.userId,
          ),
      )
      .map((m) => m.userId)
      .filter((id) => id !== ctx.user.id)
    notify(
      ctx,
      pending,
      'deadline_review',
      `Reminder: please acknowledge ${label(doc)}`,
      `${ctx.user.name} asked you to read v${doc.approvedVersion} and confirm you understand it.`,
      docHref(ctx, doc),
    )
    audit(
      ctx,
      'document.ack_reminder_sent',
      { type: 'document', id: doc.id, label: label(doc) },
      { count: pending.length },
    )
    commit()
    return json({ reminded: pending.length })
  }),
]

// Documents are searchable by ID, title and the text the caller can read.
searchSources.push({
  type: 'document',
  label: 'Policies',
  items: (ctx) => {
    if (!ctx.can('policies.read')) return []
    return visibleDocs(ctx).map((d) => {
      const v = ctx.db.documentVersions.find(
        (x) => x.documentId === d.id && x.version === d.currentVersion,
      )
      return {
        type: 'document' as const,
        id: d.id,
        ref: d.docId,
        title: d.title,
        href: `/${ctx.org.slug}/policies/${d.id}`,
        snippet: null,
        text: v?.bodyMarkdown.replace(/[#*_`>[\]-]/g, ' ').replace(/\s+/g, ' ') ?? '',
      }
    })
  },
})
