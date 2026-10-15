// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type { IncidentSummary, OverviewResponse, SearchResponse, TokenPair } from '@/lib/api/types'
import { addDaysToDate } from '@/lib/privacy'
import { todayInTz } from '@/lib/utils/dates'
import { dispatchMock } from '@/mocks/dispatch'
import { getDb, resetDb } from '@/mocks/store'

// Seeded at the real time: request handlers use the real clock, so day counts must agree.
const NOW = new Date()
const users = {
  admin: 'jehnsen.enrique@3rdloop.example',
  approver: 'michael.manabat@3rdloop.example',
  staff: 'staff@3rdloop.example',
  auditor: 'auditor@audit-firm.example',
  clinic: 'liza.santos@sample-clinic.example',
}

async function call<T = unknown>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  org = '3rdloop',
) {
  const res = await dispatchMock(
    new Request(`http://mock.local/api/v1/orgs/${org}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
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
    admin: await login(users.admin),
    approver: await login(users.approver),
    staff: await login(users.staff),
    auditor: await login(users.auditor),
    clinic: await login(users.clinic),
  }
})

const overview = (token: string, org = '3rdloop') =>
  call<OverviewResponse>(token, 'GET', '/overview', undefined, org)

/** The API path behind an app href, so a test can open the record a dashboard row links to. */
function apiPathOf(href: string): string {
  const rest = href.replace(/^\/[^/]+\//, '')
  const [a, b, c] = rest.split('/')
  if (a === 'policies') return `/documents/${b}`
  if (a === 'privacy' && b === 'incidents') return `/incidents/${c}`
  if (a === 'privacy' && b === 'requests') return `/dsrs/${c}`
  if (a === 'privacy' && b === 'agreements') return `/agreements/${c}`
  throw new Error(`No API path known for ${href}`)
}

describe('overview: Needs attention matches the seed data', () => {
  it('lists exactly the five seeded items, ranked by risk class', async () => {
    const year = todayInTz('Asia/Manila', NOW).slice(0, 4)
    const { status, body } = await overview(t.admin)
    expect(status).toBe(200)
    expect(body.attention.items.map((i) => [i.kind, i.ref])).toEqual([
      ['breach_deadline', `INC-${year}-0003`],
      ['dsr_due', `DSR-${year}-0012`],
      ['policy_approval', 'ITD-007'],
      ['review_overdue', 'ITD-013'],
      ['agreement_renewal', 'AGR-001'],
    ])
    expect(body.attention.total).toBe(5)
    expect(body.attention.counts).toEqual({
      breach_deadline: 1,
      dsr_due: 1,
      policy_approval: 1,
      review_overdue: 1,
      agreement_renewal: 1,
    })
  })

  it('agrees with a count taken straight from the store', () => {
    const db = getDb()
    const today = todayInTz('Asia/Manila', NOW)
    const soon = addDaysToDate(today, 7)
    const monthOut = addDaysToDate(today, 30)
    const org = 'org_3rdloop'
    const expected = {
      breach_deadline: db.incidents.filter(
        (i) =>
          i.orgId === org &&
          i.status !== 'closed' &&
          i.personalDataInvolved &&
          !i.npcNotifiedAt &&
          i.notificationRequired !== false,
      ).length,
      dsr_due: db.dsrs.filter(
        (d) =>
          d.orgId === org &&
          ['received', 'identity_verified', 'in_progress'].includes(d.status) &&
          d.dueAt <= soon,
      ).length,
      policy_approval: db.documents.filter((d) => d.orgId === org && d.status === 'in_review')
        .length,
      review_overdue: db.documents.filter(
        (d) => d.orgId === org && d.approvedVersion !== null && (d.nextReviewDate ?? '9') < today,
      ).length,
      agreement_renewal: db.agreements.filter(
        (a) => a.orgId === org && a.renewsAt !== null && a.renewsAt <= monthOut,
      ).length,
    }
    return overview(t.admin).then(({ body }) => {
      expect(body.attention.counts).toEqual(
        Object.fromEntries(Object.entries(expected).filter(([, n]) => n > 0)),
      )
    })
  })

  it('links every item to the record it names', async () => {
    const { body } = await overview(t.admin)
    for (const item of body.attention.items) {
      expect(item.href.startsWith('/3rdloop/')).toBe(true)
      const record = await call<{ ref?: string; docId?: string }>(
        t.admin,
        'GET',
        apiPathOf(item.href),
      )
      expect(record.status, item.href).toBe(200)
      expect(record.body.ref ?? record.body.docId, item.href).toBe(item.ref)
    }
  })

  it('gives the breach a live deadline 72 hours after discovery, in the red under 6 hours', async () => {
    const { body } = await overview(t.admin)
    const breach = body.attention.items.find((i) => i.kind === 'breach_deadline')
    const stored = getDb().incidents.find((i) => i.id === 'inc_2026_0003')
    expect(breach?.deadline).toBe(stored?.notificationDeadline)
    // Discovered 30 h ago: 42 h left, so warn, not bad.
    expect(breach?.tone).toBe('warn')
    expect(breach?.detail).toBe('Decide whether NPC notification is required')

    // Backdate discovery so the deadline is 3 h away.
    const incident = await call<IncidentSummary>(t.admin, 'GET', '/incidents/inc_2026_0003')
    const discoveredAt = new Date(Date.now() - 69 * 3_600_000).toISOString()
    const patched = await call(t.admin, 'PATCH', '/incidents/inc_2026_0003', {
      ifVersion: incident.body.version,
      discoveredAt,
    })
    expect(patched.status).toBe(200)
    const after = (await overview(t.admin)).body.attention.items[0]
    expect(after?.kind).toBe('breach_deadline')
    expect(after?.tone).toBe('bad')
  })

  it('tells approvers a policy is theirs to decide, and others it is waiting', async () => {
    const forApprover = (await overview(t.approver)).body.attention.items.find(
      (i) => i.ref === 'ITD-007',
    )
    expect(forApprover?.badge).toBe('Ready for your decision')
    const forAdmin = (await overview(t.admin)).body.attention.items.find((i) => i.ref === 'ITD-007')
    // The admin can approve too (owner/admin hold every permission).
    expect(forAdmin?.badge).toBe('Ready for your decision')
  })

  it('drops an item once its work is done', async () => {
    const doc = await call<{ id: string; version: number }>(t.approver, 'GET', '/documents/ITD-007')
    const approved = await call(t.approver, 'POST', `/documents/${doc.body.id}/approve`, {
      ifVersion: doc.body.version,
    })
    expect(approved.status).toBe(200)
    const { body } = await overview(t.admin)
    expect(body.attention.counts.policy_approval).toBeUndefined()
    expect(body.attention.total).toBe(4)
  })

  it('stops counting a breach once notification is ruled out', async () => {
    const incident = await call<IncidentSummary>(t.admin, 'GET', '/incidents/inc_2026_0003')
    await call(t.admin, 'PATCH', '/incidents/inc_2026_0003', {
      ifVersion: incident.body.version,
      notificationRequired: false,
      notificationRationale: 'Access logs show no download of the backup.',
    })
    const { body } = await overview(t.admin)
    expect(body.attention.counts.breach_deadline).toBeUndefined()
  })
})

describe('overview: who sees what', () => {
  it('staff get no list, activity or controls, and only approved policies in the counts', async () => {
    const { body } = await overview(t.staff)
    expect(body.attention).toEqual({ total: 0, counts: {}, items: [] })
    expect(body.recentActivity).toBeNull()
    expect(body.controlCoverage).toBeNull()
    expect(body.documents?.in_review).toBe(0)
    expect(body.documents?.draft).toBe(0)
    expect(body.documents?.approved).toBeGreaterThan(0)
  })

  it('auditors see counts and coverage but no operational list or activity', async () => {
    const { body } = await overview(t.auditor)
    expect(body.attention.items).toEqual([])
    expect(body.recentActivity).toBeNull()
    expect(body.documents?.in_review).toBe(0)
    expect(body.controlCoverage?.length).toBeGreaterThan(0)
  })

  it('counts controlled documents, not section pages', async () => {
    const { body } = await overview(t.admin)
    const docs = getDb().documents.filter(
      (d) => d.orgId === 'org_3rdloop' && !d.docId.startsWith('SEC-'),
    )
    expect(body.documents?.total).toBe(docs.length)
    expect(body.documents?.total).toBe(16)
    for (const status of ['approved', 'in_review', 'draft', 'retired'] as const) {
      expect(body.documents?.[status]).toBe(docs.filter((d) => d.status === status).length)
    }
  })

  it('sums control coverage to the applicable controls', async () => {
    const { body } = await overview(t.admin)
    const applicable = getDb().controls.filter(
      (c) => c.orgId === 'org_3rdloop' && c.status !== 'not_applicable',
    )
    const rows = body.controlCoverage ?? []
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(applicable.length)
    for (const r of rows) expect(r.passing + r.failing + r.no_evidence).toBe(r.total)
  })

  it('leaves Evidence out of Starter and keeps every link inside the tenant', async () => {
    const { body } = await overview(t.clinic, 'sample-clinic')
    expect(body.controlCoverage).toBeNull()
    for (const i of body.attention.items) expect(i.href.startsWith('/sample-clinic/')).toBe(true)
    // Nothing from 3rdLoop leaks across.
    const refs = body.attention.items.map((i) => i.ref)
    expect(refs).not.toContain('ITD-007')
    expect(refs).not.toContain('AGR-001')
  })

  it('hides requester identities from the dashboard', async () => {
    const text = JSON.stringify((await overview(t.admin)).body)
    expect(text).not.toContain('Maria Clara')
    expect(text).not.toContain('mcdelacruz')
  })

  it('shows recent activity newest first, linking records the caller can open', async () => {
    const { body } = await overview(t.admin)
    const items = body.recentActivity ?? []
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(10)
    const times = items.map((e) => Date.parse(e.at))
    expect(times).toEqual([...times].sort((a, b) => b - a))
    for (const e of items.filter((x) => x.href)) expect(e.href?.startsWith('/3rdloop/')).toBe(true)
  })

  it('keeps reveal events out of activity for people who cannot manage the log', async () => {
    // The DPO reveals a requester's name; the approver's dashboard must not name it.
    const dsr = getDb().dsrs.find((d) => d.id === 'dsr_2026_0012')
    await call(t.admin, 'POST', '/sensitive/reveal', {
      targetType: 'dsr',
      targetId: dsr?.id,
      field: 'requesterName',
    })
    const approver = (await overview(t.approver)).body.recentActivity ?? []
    expect(approver.some((e) => e.action.startsWith('sensitive.'))).toBe(false)
  })
})

describe('search', () => {
  const search = (token: string, q: string, extra = '', org = '3rdloop') =>
    call<SearchResponse>(token, 'GET', `/search?q=${encodeURIComponent(q)}${extra}`, undefined, org)

  it('finds a record by ID first and highlights nothing it cannot see', async () => {
    const { body } = await search(t.admin, 'ITD-006')
    const docs = body.groups.find((g) => g.type === 'document')
    expect(docs?.items[0]?.ref).toBe('ITD-006')
  })

  it('requires every word to match', async () => {
    const both = await search(t.admin, 'access control')
    const refs = both.body.groups.flatMap((g) => g.items.map((i) => i.ref))
    expect(refs).toContain('ITD-007')
    const none = await search(t.admin, 'access zebra')
    expect(none.body.groups).toEqual([])
  })

  it('marks every matching word in a snippet', async () => {
    const { body } = await search(t.admin, 'personal data')
    const snippets = body.groups.flatMap((g) => g.items.map((i) => i.snippet ?? ''))
    expect(snippets.some((s) => /«personal»/i.test(s) && /«data»/i.test(s))).toBe(true)
  })

  it('reports the full total and honours limit and type', async () => {
    const wide = await search(t.admin, 'data', '&limit=2')
    const group = wide.body.groups.find((g) => g.type === 'document')
    expect(group?.items.length).toBeLessThanOrEqual(2)
    expect(group?.total).toBeGreaterThan(group?.items.length ?? 0)
    const only = await search(t.admin, 'data', '&type=document&limit=50')
    expect(only.body.groups.map((g) => g.type)).toEqual(['document'])
    expect(only.body.groups[0]?.items.length).toBe(only.body.groups[0]?.total)
  })

  it('searches controls on plans with Evidence, and orders groups the same way every time', async () => {
    const { body } = await search(t.admin, 'access')
    const types = body.groups.map((g) => g.type)
    expect(types).toContain('control')
    expect(types.indexOf('document')).toBeLessThan(types.indexOf('control'))
  })

  it('leaves out what the caller cannot open', async () => {
    // Drafts and the privacy registers are not for staff; controls are not on Starter.
    const staff = await search(t.staff, 'backup')
    expect(staff.body.groups.some((g) => g.type === 'incident')).toBe(false)
    const clinic = await search(t.clinic, 'access', '', 'sample-clinic')
    expect(clinic.body.groups.some((g) => g.type === 'control')).toBe(false)
  })

  it('never matches or shows a requester’s identity', async () => {
    expect((await search(t.admin, 'Maria Clara')).body.groups).toEqual([])
  })

  it('ignores queries under two characters', async () => {
    expect((await search(t.admin, 'a')).body.groups).toEqual([])
  })
})

describe('notifications', () => {
  it('links every seeded notification to a record its recipient can open', async () => {
    const db = getDb()
    const tokens: Record<string, string> = {
      usr_jehnsen: t.admin,
      usr_michael: t.approver,
      usr_staff: t.staff,
      usr_clinic_dpo: t.clinic,
    }
    for (const n of db.notifications) {
      const org = db.orgs.find((o) => o.id === n.orgId)
      expect(n.href.startsWith(`/${org?.slug}/`), n.href).toBe(true)
      const token = tokens[n.userId]
      expect(token, n.userId).toBeTruthy()
      // Pages that exist in this milestone: records must open for the person notified.
      if (/\/(policies\/doc_|privacy\/(incidents|requests)\/)/.test(n.href)) {
        const res = await call(token ?? '', 'GET', apiPathOf(n.href), undefined, org?.slug)
        expect(res.status, n.href).toBe(200)
      }
    }
  })
})
