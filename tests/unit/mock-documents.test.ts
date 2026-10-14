// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  AcknowledgementStatus,
  DocumentDetail,
  DocumentSummary,
  DocumentVersion,
  ListResponse,
  TokenPair,
} from '@/lib/api/types'
import { dispatchMock } from '@/mocks/dispatch'
import { resetDb } from '@/mocks/store'

const NOW = new Date('2026-10-14T04:00:00Z')
const users = {
  editor: 'jehnsen.enrique@3rdloop.example',
  approver: 'michael.manabat@3rdloop.example',
  staff: 'staff@3rdloop.example',
  auditor: 'auditor@audit-firm.example',
}

async function call<T = unknown>(token: string, method: string, path: string, body?: unknown) {
  const res = await dispatchMock(
    new Request(`http://mock.local/api/v1/orgs/3rdloop${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T }
}

async function login(email: string) {
  const res = await dispatchMock(
    new Request('http://mock.local/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'loopdox-demo' }),
    }),
  )
  return ((await res.json()) as TokenPair).accessToken
}

let t: Record<keyof typeof users, string>

beforeEach(async () => {
  resetDb(NOW)
  t = {
    editor: await login(users.editor),
    approver: await login(users.approver),
    staff: await login(users.staff),
    auditor: await login(users.auditor),
  }
})

const newPolicy = {
  docId: 'ITD-017',
  title: 'Remote Work Policy',
  parentId: 'doc_sec_security',
  owner: 'usr_jehnsen',
  reviewCycleMonths: 12,
  requiresApproval: true,
  classification: 'internal',
  bodyMarkdown: '## 1. Purpose\n\nWork safely from home.\n',
  changeSummary: 'First draft.',
}

describe('documents: visibility', () => {
  it('shows staff only approved versions', async () => {
    const list = await call<ListResponse<DocumentSummary>>(t.staff, 'GET', '/documents?pageSize=200')
    const ids = list.body.items.map((d) => d.docId)
    expect(ids).not.toContain('ITD-010') // never approved
    const itd015 = list.body.items.find((d) => d.docId === 'ITD-015')
    expect(itd015).toMatchObject({ status: 'approved', currentVersion: 2 })
    const detail = await call<DocumentDetail>(t.staff, 'GET', '/documents/ITD-015')
    expect(detail.body.content?.version).toBe(2)
    expect(detail.body.workflow).toEqual([])
    expect((await call(t.staff, 'GET', '/documents/ITD-015/versions/3')).status).toBe(404)
    expect((await call(t.staff, 'GET', '/documents/doc_itd_010')).status).toBe(404)
  })

  it('shows editors the latest draft and the review states', async () => {
    const d = await call<DocumentDetail>(t.editor, 'GET', '/documents/ITD-015')
    expect(d.body).toMatchObject({ status: 'draft', currentVersion: 3, approvedVersion: 2 })
    expect(d.body.content?.version).toBe(3)
    const overdue = await call<ListResponse<DocumentSummary>>(t.editor, 'GET', '/documents?review=overdue')
    expect(overdue.body.items.map((x) => x.docId)).toEqual(['ITD-013'])
    const dueSoon = await call<ListResponse<DocumentSummary>>(t.editor, 'GET', '/documents?review=due_soon')
    expect(dueSoon.body.items.map((x) => x.docId)).toEqual(['ITD-003'])
  })

  it('filters by framework through linked controls', async () => {
    const npc = await call<ListResponse<DocumentSummary>>(t.editor, 'GET', '/documents?framework=NPC')
    expect(npc.body.items.map((x) => x.docId).sort()).toEqual(['ITD-004', 'ITD-012'])
  })
})

describe('documents: M2 acceptance path', () => {
  it('create → submit → approve → acknowledge → edit returns to draft → diff → restore', async () => {
    // Create
    const created = await call<DocumentDetail>(t.editor, 'POST', '/documents', newPolicy)
    expect(created.status).toBe(201)
    const id = created.body.id
    expect(created.body).toMatchObject({ status: 'draft', currentVersion: 1, approvedVersion: null })

    // Staff can't see it yet; approver can't approve a draft.
    expect((await call(t.staff, 'GET', `/documents/${id}`)).status).toBe(404)
    expect((await call(t.approver, 'POST', `/documents/${id}/approve`, {})).status).toBe(422)

    // Submit, then approve
    const submitted = await call<DocumentDetail>(t.editor, 'POST', `/documents/${id}/submit`, {})
    expect(submitted.body.status).toBe('in_review')
    expect((await call(t.editor, 'POST', `/documents/${id}/approve`, {})).status).toBe(200) // admin can approve too
    // ...but use a fresh doc for the approver path:
    const second = await call<DocumentDetail>(t.editor, 'POST', '/documents', { ...newPolicy, docId: 'ITD-018' })
    await call(t.editor, 'POST', `/documents/${second.body.id}/submit`, {})
    expect((await call(t.staff, 'POST', `/documents/${second.body.id}/approve`, {})).status).toBe(403)
    const approved = await call<DocumentDetail>(t.approver, 'POST', `/documents/${second.body.id}/approve`, {})
    expect(approved.body).toMatchObject({
      status: 'approved',
      approvedVersion: 1,
      effectiveDate: '2026-10-14',
      nextReviewDate: '2027-10-14',
      approvedBy: 'usr_michael',
    })

    // Staff acknowledge
    const pendingBefore = await call<ListResponse<DocumentSummary>>(t.staff, 'GET', '/documents?ack=pending&pageSize=200')
    expect(pendingBefore.body.items.map((d) => d.docId)).toContain('ITD-018')
    expect((await call(t.staff, 'POST', `/documents/${second.body.id}/acknowledgements`)).status).toBe(201)
    const pendingAfter = await call<ListResponse<DocumentSummary>>(t.staff, 'GET', '/documents?ack=pending&pageSize=200')
    expect(pendingAfter.body.items.map((d) => d.docId)).not.toContain('ITD-018')
    const acks = await call<AcknowledgementStatus>(t.editor, 'GET', `/documents/${second.body.id}/acknowledgements`)
    expect(acks.body.members.find((m) => m.userId === 'usr_staff')?.acknowledgedAt).toBeTruthy()
    expect((await call(t.auditor, 'POST', `/documents/${second.body.id}/acknowledgements`)).status).toBe(403)

    // A new edit returns it to draft; v1 stays approved and visible to staff.
    const edited = await call<DocumentDetail>(t.editor, 'PATCH', `/documents/${second.body.id}`, {
      ifVersion: approved.body.version,
      bodyMarkdown: '## 1. Purpose\n\nWork safely from home or a co-working space.\n',
      changeSummary: 'Allow co-working spaces.',
    })
    expect(edited.body).toMatchObject({ status: 'draft', currentVersion: 2, approvedVersion: 1 })
    const staffView = await call<DocumentDetail>(t.staff, 'GET', `/documents/${second.body.id}`)
    expect(staffView.body.content?.bodyMarkdown).toContain('Work safely from home.')

    // History has both versions with real content
    const v1 = await call<DocumentVersion>(t.editor, 'GET', `/documents/${second.body.id}/versions/1`)
    const v2 = await call<DocumentVersion>(t.editor, 'GET', `/documents/${second.body.id}/versions/2`)
    expect(v1.body.bodyMarkdown).not.toEqual(v2.body.bodyMarkdown)

    // Restore v1 creates v3
    const restored = await call<DocumentDetail>(t.editor, 'POST', `/documents/${second.body.id}/restore`, {
      version: 1,
      ifVersion: edited.body.version,
    })
    expect(restored.body).toMatchObject({ currentVersion: 3, status: 'draft' })
    expect(restored.body.content).toMatchObject({ type: 'restore', restoredFrom: 1, bodyMarkdown: v1.body.bodyMarkdown })
  })
})

describe('documents: validation and concurrency', () => {
  it('rejects a duplicate document ID with a field error', async () => {
    const res = await call<{ error: { fields: Record<string, string> } }>(t.editor, 'POST', '/documents', {
      ...newPolicy,
      docId: 'ITD-006',
    })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.docId).toContain('Information Security Policy')
  })

  it('returns 409 for a stale ifVersion', async () => {
    const d = await call<DocumentDetail>(t.editor, 'GET', '/documents/ITD-006')
    await call(t.editor, 'PATCH', '/documents/ITD-006', { ifVersion: d.body.version, owner: 'usr_michael' })
    const stale = await call<{ error: { code: string } }>(t.editor, 'PATCH', '/documents/ITD-006', {
      ifVersion: d.body.version,
      bodyMarkdown: 'x',
      changeSummary: 'Change body.',
    })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('version_conflict')
  })

  it('requires a change summary for content edits and a note to request changes', async () => {
    const d = await call<DocumentDetail>(t.editor, 'GET', '/documents/ITD-006')
    expect((await call(t.editor, 'PATCH', '/documents/ITD-006', { ifVersion: d.body.version, bodyMarkdown: 'x' })).status).toBe(400)
    expect((await call(t.approver, 'POST', '/documents/ITD-007/reject', {})).status).toBe(400)
    const rejected = await call<DocumentDetail>(t.approver, 'POST', '/documents/ITD-007/reject', { note: 'Say how long admin access lasts.' })
    expect(rejected.body.status).toBe('draft')
    expect(rejected.body.workflow[0]).toMatchObject({ type: 'reject', note: 'Say how long admin access lasts.' })
  })

  it('suggests the next ID and only deletes never-approved drafts', async () => {
    const next = await call<{ docId: string }>(t.editor, 'GET', '/documents/next-id')
    expect(next.body.docId).toBe('ITD-017')
    expect((await call(t.editor, 'DELETE', '/documents/ITD-006')).status).toBe(422)
    expect((await call(t.editor, 'DELETE', '/documents/doc_itd_010')).status).toBe(204)
  })

  it('reorders siblings', async () => {
    await call(t.editor, 'POST', '/documents/reorder', {
      parentId: 'doc_sec_security',
      orderedIds: ['doc_itd_010', 'doc_itd_006', 'doc_itd_007', 'doc_itd_008', 'doc_itd_009'],
    })
    const list = await call<ListResponse<DocumentSummary>>(t.editor, 'GET', '/documents?parent=doc_sec_security&sort=order')
    expect(list.body.items[0]?.docId).toBe('ITD-010')
  })
})
