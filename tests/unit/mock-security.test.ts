// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  AccessGrantSummary,
  AccessReviewSummary,
  ChangeSummary,
  DecisionSummary,
  EvidenceItem,
  LinksResponse,
  ListResponse,
  OverviewResponse,
  RiskSummary,
  SearchResponse,
  SecretRecordSummary,
  SystemSummary,
  TokenPair,
} from '@/lib/api/types'
import { periodEnd, periodOf } from '@/lib/security'
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

const list = <T>(token: string, path: string) => call<ListResponse<T>>(token, 'GET', path)

describe('seed', () => {
  it('has the register sizes the spec asks for', async () => {
    const systems = await list<SystemSummary>(t.admin, '/systems')
    expect(systems.body.items.map((s) => s.ref).sort()[0]).toBe('SYS-001')
    expect(systems.body.total).toBe(10)
    expect((await list(t.admin, '/access-grants?pageSize=100')).body.total).toBe(25)
    const reviews = await list<AccessReviewSummary>(t.admin, '/access-reviews')
    expect(reviews.body.items.map((r) => r.status).sort()).toEqual(['in_progress', 'signed_off'])
    expect((await list(t.admin, '/secret-records')).body.total).toBe(8)
    const changes = await list<ChangeSummary>(t.admin, '/changes?pageSize=100')
    expect(changes.body.total).toBe(15)
    expect(changes.body.items.filter((c) => c.emergency)).toHaveLength(3)
    expect((await list(t.admin, '/risks')).body.total).toBe(12)
    expect((await list(t.admin, '/decisions')).body.total).toBe(4)
  })

  it('has two secrets overdue for rotation, and flags them first', async () => {
    const { body } = await list<SecretRecordSummary>(t.admin, '/secret-records')
    expect(body.items.filter((s) => s.dueState === 'overdue')).toHaveLength(2)
    expect(body.items.slice(0, 2).every((s) => s.dueState === 'overdue')).toBe(true)
  })
})

describe('permissions and plans', () => {
  it('lets staff see nothing and auditors read without writing', async () => {
    expect((await call(t.staff, 'GET', '/systems')).status).toBe(403)
    expect((await call(t.staff, 'GET', '/risks')).status).toBe(403)
    expect((await call(t.auditor, 'GET', '/systems')).status).toBe(200)
    const write = await call(t.auditor, 'POST', '/changes', {})
    expect(write.status).toBe(403)
    // An approver reads the registers but can't change them.
    expect((await call(t.approver, 'GET', '/access-reviews')).status).toBe(200)
    expect(
      (await call(t.approver, 'POST', '/access-reviews/ar_x/sign-off', { ifVersion: 1 })).status,
    ).toBe(403)
  })

  it('keeps Starter out of the security registers', async () => {
    const res = await call<{ error: { code: string } }>(
      t.clinic,
      'GET',
      '/systems',
      undefined,
      'sample-clinic',
    )
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('feature_not_in_plan')
  })
})

describe('systems', () => {
  it('creates with the next reference, and refuses to delete one still in use', async () => {
    const created = await call<SystemSummary>(t.admin, 'POST', '/systems', {
      name: 'Staging environment',
      type: 'cloud_account',
      provider: 'Microsoft Azure',
      owner: 'usr_jehnsen',
      classification: 'internal',
      hosting: 'Azure Southeast Asia',
      holdsPersonalData: false,
      notes: '',
    })
    expect(created.status).toBe(201)
    expect(created.body.ref).toBe('SYS-011')
    expect((await call(t.admin, 'DELETE', '/systems/sys_github')).status).toBe(422)
    expect((await call(t.admin, 'DELETE', `/systems/${created.body.id}`)).status).toBe(204)
  })

  it('shows access grants, secrets, changes and decisions as linked records', async () => {
    const { body } = await call<LinksResponse>(
      t.admin,
      'GET',
      '/links?type=system&id=sys_azure_prod',
    )
    const byType = Object.fromEntries(body.groups.map((g) => [g.type, g.items.length]))
    expect(byType.access_grant).toBe(3)
    expect(byType.secret_record).toBe(1)
    expect(byType.change).toBeGreaterThan(0)
    expect(byType.decision).toBeGreaterThan(0)
    expect(byType.processing_activity).toBeGreaterThan(0)
  })

  it('lets a CTO link a decision to a system, and not a DPO-only edit', async () => {
    const linked = await call(t.admin, 'POST', '/links', {
      from: { type: 'decision', id: 'adr_002' },
      to: { type: 'system', id: 'sys_github' },
    })
    expect(linked.status).toBe(204)
    expect(getDb().decisions.find((d) => d.id === 'adr_002')?.systemIds).toContain('sys_github')
    // Grants point at their system through their own form.
    const managed = await call(t.admin, 'POST', '/links', {
      from: { type: 'access_grant', id: 'grant_001' },
      to: { type: 'system', id: 'sys_nas' },
    })
    expect(managed.status).toBe(422)
  })
})

describe('access grants', () => {
  it('groups by person and filters external parties', async () => {
    const ext = await list<AccessGrantSummary>(t.admin, '/access-grants?external=true&pageSize=100')
    expect(ext.body.items.every((g) => g.externalName)).toBe(true)
    const ramil = ext.body.items.filter((g) => g.personName.startsWith('Ramil'))
    expect(ramil).toHaveLength(3)
    expect(new Set(ramil.map((g) => g.personKey)).size).toBe(1)
    const mine = await list<AccessGrantSummary>(
      t.admin,
      '/access-grants?person=usr_jehnsen&pageSize=100',
    )
    expect(mine.body.items.length).toBeGreaterThan(5)
  })

  it('refuses a duplicate grant and records a revocation', async () => {
    const dup = await call(t.admin, 'POST', '/access-grants', {
      systemId: 'sys_github',
      userId: 'usr_jehnsen',
      externalName: null,
      level: 'admin',
      approvedBy: 'usr_michael',
      grantedAt: todayInTz('Asia/Manila', NOW),
      notes: '',
    })
    expect(dup.status).toBe(422)
    const grant = await call<AccessGrantSummary>(t.admin, 'GET', '/access-grants?q=Kuya')
    const revoked = await call<AccessGrantSummary>(
      t.admin,
      'POST',
      `/access-grants/${(grant.body as unknown as ListResponse<AccessGrantSummary>).items[0]?.id}/revoke`,
      { ifVersion: 1 },
    )
    expect(revoked.body.status).toBe('revoked')
    expect((await list(t.admin, '/access-grants?pageSize=100')).body.total).toBe(24)
  })

  it('needs exactly one of a member or an outside name', async () => {
    const bad = await call(t.admin, 'POST', '/access-grants', {
      systemId: 'sys_nas',
      userId: null,
      externalName: null,
      level: 'read',
      approvedBy: 'usr_jehnsen',
      grantedAt: '2026-01-01',
      notes: '',
    })
    expect(bad.status).toBe(400)
  })
})

describe('M5 acceptance: completing an access review creates evidence on the access control', () => {
  const inProgress = async () => {
    const all = await list<AccessReviewSummary>(t.admin, '/access-reviews')
    const review = all.body.items.find((r) => r.status === 'in_progress')
    if (!review) throw new Error('no review in progress')
    return review
  }

  it('applies the decisions at sign-off and puts the evidence on A.5.15’s timeline', async () => {
    const review = await inProgress()
    expect(review.decided).toBeLessThan(review.total)

    // Sign-off is blocked until every grant has a decision.
    const early = await call(t.admin, 'POST', `/access-reviews/${review.id}/sign-off`, {
      ifVersion: review.version,
    })
    expect(early.status).toBe(422)

    const kept = await call<AccessReviewSummary>(
      t.admin,
      'POST',
      `/access-reviews/${review.id}/keep-all`,
      { ifVersion: review.version },
    )
    expect(kept.body.decided).toBe(kept.body.total)

    const control = getDb().controls.find((c) => c.reference === 'A.5.15')
    const before = await list<EvidenceItem>(t.admin, `/controls/${control?.id}/evidence`)
    const signed = await call<AccessReviewSummary>(
      t.admin,
      'POST',
      `/access-reviews/${review.id}/sign-off`,
      { ifVersion: kept.body.version },
    )
    expect(signed.status).toBe(200)
    expect(signed.body.status).toBe('signed_off')
    expect(signed.body.evidence?.controlId).toBe(control?.id)

    const after = await list<EvidenceItem>(t.admin, `/controls/${control?.id}/evidence`)
    expect(after.body.total).toBe(before.body.total + 1)
    const newest = after.body.items[0]
    expect(newest?.id).toBe(signed.body.evidenceId)
    expect(newest?.originHref).toBe(`/3rdloop/security/access-reviews/${review.id}`)
    expect(newest?.summary).toContain(review.period)
    expect(newest?.summary).toMatch(/1 revoked, 1 changed/)

    // The decisions were applied to the grants themselves.
    const grants = getDb().accessGrants
    expect(grants.find((g) => g.id === 'grant_008')?.status).toBe('revoked')
    expect(grants.find((g) => g.id === 'grant_004')?.level).toBe('read')
    const today = todayInTz('Asia/Manila', NOW)
    expect(grants.find((g) => g.id === 'grant_001')?.lastReviewedAt).toBe(today)

    // And it can't be signed twice.
    expect(
      (
        await call(t.admin, 'POST', `/access-reviews/${review.id}/sign-off`, {
          ifVersion: signed.body.version,
        })
      ).status,
    ).toBe(422)
    // The dashboard stops listing it.
    const overview = await call<OverviewResponse>(t.admin, 'GET', '/overview')
    expect(overview.body.attention.counts.access_review).toBeUndefined()
  })

  it('wants a reason to revoke and a level to change to', async () => {
    const review = await inProgress()
    const open = review.items.find((i) => !i.decision)
    const path = `/access-reviews/${review.id}/items/${open?.grantId}`
    expect(
      (await call(t.admin, 'POST', path, { ifVersion: review.version, decision: 'revoke' })).status,
    ).toBe(400)
    expect(
      (await call(t.admin, 'POST', path, { ifVersion: review.version, decision: 'change' })).status,
    ).toBe(400)
    const ok = await call<AccessReviewSummary>(t.admin, 'POST', path, {
      ifVersion: review.version,
      decision: 'revoke',
      note: 'Left the project.',
    })
    expect(ok.status).toBe(200)
    expect(ok.body.counts.revoke).toBe(review.counts.revoke + 1)
    // Clearing a decision puts it back to undecided.
    const cleared = await call<AccessReviewSummary>(t.admin, 'POST', path, {
      ifVersion: ok.body.version,
      decision: null,
    })
    expect(cleared.body.decided).toBe(review.decided)
  })

  it('opens a new review from the active grants of the systems chosen', async () => {
    const period = `${Number(periodOf(todayInTz('Asia/Manila', NOW)).slice(0, 4)) + 1}-Q1`
    const res = await call<AccessReviewSummary>(t.admin, 'POST', '/access-reviews', {
      period,
      systemIds: ['sys_payroll', 'sys_mailer'],
      reviewer: 'usr_jehnsen',
    })
    expect(res.status).toBe(201)
    expect(res.body.total).toBe(5)
    expect(res.body.dueAt).toBe(periodEnd(period))
    expect(res.body.items.every((i) => i.decision === null)).toBe(true)
    // One open review per period.
    const dup = await call(t.admin, 'POST', '/access-reviews', {
      period,
      systemIds: ['sys_nas'],
      reviewer: 'usr_jehnsen',
    })
    expect(dup.status).toBe(422)
  })

  it('blocks stale writes with a 409', async () => {
    const review = await inProgress()
    const open = review.items.find((i) => !i.decision)
    const res = await call(t.admin, 'POST', `/access-reviews/${review.id}/items/${open?.grantId}`, {
      ifVersion: review.version + 3,
      decision: 'keep',
    })
    expect(res.status).toBe(409)
  })
})

describe('secrets', () => {
  it('never stores a value', async () => {
    const res = await call<{ error: { fields?: Record<string, string> } }>(
      t.admin,
      'POST',
      '/secret-records',
      {
        name: 'Stripe key',
        location: '1Password vault',
        systemId: null,
        owner: 'usr_jehnsen',
        lastRotatedAt: '2026-09-01',
        rotationDays: 90,
        notes: '',
        value: 'sk_live_123',
      },
    )
    expect(res.status).toBe(400)
    expect(res.body.error.fields?.value).toMatch(/never its value/)
    expect(JSON.stringify(getDb().secrets)).not.toContain('sk_live')
  })

  it('marks a secret rotated, restarting its clock', async () => {
    const overdue = (await list<SecretRecordSummary>(t.admin, '/secret-records')).body.items[0]
    expect(overdue?.dueState).toBe('overdue')
    const res = await call<SecretRecordSummary>(
      t.admin,
      'POST',
      `/secret-records/${overdue?.id}/mark-rotated`,
      { ifVersion: overdue?.version },
    )
    expect(res.body.lastRotatedAt).toBe(todayInTz('Asia/Manila', NOW))
    expect(res.body.dueState).toBe('ok')
    expect(res.body.daysLeft).toBe(overdue?.rotationDays)
    const after = await call<OverviewResponse>(t.admin, 'GET', '/overview')
    expect(after.body.attention.counts.secret_rotation).toBe(1)
  })
})

describe('changes', () => {
  it('tracks the 48-hour review owed by emergency changes', async () => {
    const { body } = await list<ChangeSummary>(t.admin, '/changes?emergency=true&pageSize=100')
    const byRef = Object.fromEntries(body.items.map((c) => [c.ref, c.reviewState]))
    expect(byRef).toEqual({ 'CHG-009': 'done', 'CHG-012': 'overdue', 'CHG-015': 'pending' })
    const normal = await list<ChangeSummary>(t.admin, '/changes?emergency=false&pageSize=100')
    expect(normal.body.items.every((c) => c.reviewState === 'not_required')).toBe(true)
  })

  it('records the review note, and only for emergency changes', async () => {
    const overdue = await call<ChangeSummary>(t.admin, 'GET', '/changes/CHG-012')
    const short = await call(t.admin, 'POST', '/changes/CHG-012/review', {
      ifVersion: overdue.body.version,
      note: 'ok',
    })
    expect(short.status).toBe(400)
    const done = await call<ChangeSummary>(t.admin, 'POST', '/changes/CHG-012/review', {
      ifVersion: overdue.body.version,
      note: 'Rolled back cleanly; the migration script was fixed in CHG-013.',
    })
    expect(done.body.reviewState).toBe('done')
    expect(done.body.reviewedByName).toBe('Jehnsen Enrique')
    const plain = await call<ChangeSummary>(t.admin, 'GET', '/changes/CHG-001')
    expect(
      (
        await call(t.admin, 'POST', '/changes/CHG-001/review', {
          ifVersion: plain.body.version,
          note: 'Reviewed after the fact.',
        })
      ).status,
    ).toBe(422)
  })

  it('needs an approver unless the change is an emergency', async () => {
    const base = {
      source: 'manual',
      externalUrl: null,
      systemId: 'sys_nas',
      summary: 'Replace the failed disk',
      approver: null,
      deployedAt: new Date(Date.now() - 3_600_000).toISOString(),
      rollbackPlan: 'Reinstall the old disk.',
    }
    expect((await call(t.admin, 'POST', '/changes', { ...base, emergency: false })).status).toBe(
      400,
    )
    const ok = await call<ChangeSummary>(t.admin, 'POST', '/changes', { ...base, emergency: true })
    expect(ok.status).toBe(201)
    expect(ok.body.ref).toBe('CHG-016')
    expect(ok.body.reviewState).toBe('pending')
  })
})

describe('risks', () => {
  it('filters the heat map by cell, on inherent or residual ratings', async () => {
    const all = (await list<RiskSummary>(t.admin, '/risks')).body.items
    const inherent = await list<RiskSummary>(t.admin, '/risks?cell=3x5')
    expect(inherent.body.items.map((r) => r.ref).sort()).toEqual(
      all
        .filter((r) => r.likelihood === 3 && r.impact === 5)
        .map((r) => r.ref)
        .sort(),
    )
    expect(inherent.body.total).toBe(2)
    const residual = await list<RiskSummary>(t.admin, '/risks?cell=2x5&basis=residual')
    expect(residual.body.total).toBe(2)
    expect(residual.body.items.every((r) => r.residualScore === 10)).toBe(true)
  })

  it('derives the scores and keeps the short form working for post-incident reviews', async () => {
    const full = await call<RiskSummary>(t.admin, 'POST', '/risks', {
      title: 'Vendor outage stops payroll',
      description: '',
      likelihood: 2,
      impact: 4,
      treatment: 'transfer',
      residualLikelihood: 2,
      residualImpact: 2,
      owner: 'usr_jehnsen',
      documentIds: ['doc_itd_014'],
      controlIds: ['ctl_a_5_15'],
    })
    expect(full.status).toBe(201)
    expect(full.body.ref).toBe('RISK-013')
    expect(full.body.inherentScore).toBe(8)
    expect(full.body.residualScore).toBe(4)
    const short = await call<RiskSummary>(t.admin, 'POST', '/risks', {
      title: 'Backup left public',
      description: 'Found during review.',
      likelihood: 3,
      impact: 4,
      owner: 'usr_jehnsen',
      incidentId: 'inc_2026_0003',
    })
    expect(short.status).toBe(201)
    expect(short.body.residualScore).toBeNull()
    expect(getDb().incidents.find((i) => i.id === 'inc_2026_0003')?.riskIds).toContain(
      short.body.id,
    )
  })

  it('rejects half a residual rating and unknown links', async () => {
    const base = {
      title: 'Test risk',
      description: '',
      likelihood: 2,
      impact: 2,
      owner: 'usr_jehnsen',
    }
    expect((await call(t.admin, 'POST', '/risks', { ...base, residualLikelihood: 2 })).status).toBe(
      400,
    )
    expect(
      (await call(t.admin, 'POST', '/risks', { ...base, controlIds: ['ctl_nope'] })).status,
    ).toBe(400)
  })

  it('shows the policies, controls and incidents a risk links to', async () => {
    const { body } = await call<LinksResponse>(t.admin, 'GET', '/links?type=risk&id=risk_001')
    const byType = Object.fromEntries(body.groups.map((g) => [g.type, g.items.length]))
    expect(byType.document).toBe(2)
    expect(byType.control).toBe(2)
  })

  it('flags a risk whose review date has passed', async () => {
    const { body } = await list<RiskSummary>(t.admin, '/risks?review=overdue')
    expect(body.items.map((r) => r.ref)).toEqual(['RISK-012'])
  })
})

describe('decisions (ADRs)', () => {
  it('supersedes an accepted decision with a new one that points back', async () => {
    const old = await call<DecisionSummary>(t.admin, 'GET', '/decisions/ADR-001')
    const res = await call<DecisionSummary>(t.admin, 'POST', '/decisions/ADR-001/supersede', {
      ifVersion: old.body.version,
      title: 'Use Azure Key Vault with HSM-backed keys',
      context: 'The auditor asked for hardware-backed keys for production secrets.',
      decision: 'Move production secrets to a Premium vault with HSM-backed keys.',
      consequences: 'Higher cost per vault. Rotation procedures stay the same.',
      decidedBy: 'usr_michael',
      decidedAt: todayInTz('Asia/Manila', NOW),
      systemIds: ['sys_keyvault'],
    })
    expect(res.status).toBe(201)
    expect(res.body.ref).toBe('ADR-005')
    expect(res.body.status).toBe('accepted')
    expect(res.body.supersedesRef).toBe('ADR-001')
    const after = await call<DecisionSummary>(t.admin, 'GET', '/decisions/ADR-001')
    expect(after.body.status).toBe('superseded')
    expect(after.body.supersededByRef).toBe('ADR-005')
  })

  it('only supersedes accepted decisions, and only deletes proposals', async () => {
    const proposed = await call<DecisionSummary>(t.admin, 'GET', '/decisions/ADR-002')
    const payload = {
      title: 'Another decision',
      context: 'Some context that is long enough.',
      decision: 'We decided something.',
      consequences: 'Things follow.',
      decidedBy: 'usr_michael',
      decidedAt: '2026-10-01',
      systemIds: [],
    }
    expect(
      (
        await call(t.admin, 'POST', '/decisions/ADR-002/supersede', {
          ...payload,
          ifVersion: proposed.body.version,
        })
      ).status,
    ).toBe(422)
    expect((await call(t.admin, 'DELETE', '/decisions/ADR-001')).status).toBe(422)
    expect((await call(t.admin, 'DELETE', '/decisions/ADR-002')).status).toBe(204)
  })

  it('treats a superseded decision as a read-only record', async () => {
    const adr3 = await call<DecisionSummary>(t.admin, 'GET', '/decisions/ADR-003')
    expect(adr3.body.supersededByRef).toBe('ADR-004')
    const edit = await call(t.admin, 'PATCH', '/decisions/ADR-003', {
      ifVersion: adr3.body.version,
      title: 'Changed',
      context: 'Some context that is long enough.',
      decision: 'Decided.',
      consequences: 'Follows.',
      status: 'accepted',
      decidedBy: 'usr_michael',
      decidedAt: '2026-01-01',
      systemIds: [],
    })
    expect(edit.status).toBe(422)
  })
})

describe('search and dashboard', () => {
  const search = (q: string) =>
    call<SearchResponse>(t.admin, 'GET', `/search?q=${encodeURIComponent(q)}`)

  it('finds secrets, changes, decisions, risks and systems by ID or words', async () => {
    const groups = async (q: string) => (await search(q)).body.groups.map((g) => g.type)
    expect(await groups('SCR-002')).toContain('secret_record')
    expect(await groups('CHG-012')).toContain('change')
    expect(await groups('ADR-004')).toContain('decision')
    expect(await groups('RISK-006')).toContain('risk')
    expect(await groups('SYS-002')).toContain('system')
    expect(await groups('Key Vault')).toEqual(expect.arrayContaining(['system', 'decision']))
  })

  it('never searches secret values (there are none) and hides security from staff', async () => {
    const staff = await call<SearchResponse>(t.staff, 'GET', '/search?q=SCR-002')
    expect(staff.body.groups).toEqual([])
  })

  it('adds overdue rotations and the open review to Needs attention', async () => {
    const { body } = await call<OverviewResponse>(t.admin, 'GET', '/overview')
    expect(body.attention.counts.secret_rotation).toBe(2)
    expect(body.attention.counts.access_review).toBe(1)
    expect(body.attention.total).toBe(8)
    const review = body.attention.items.find((i) => i.kind === 'access_review')
    expect(review?.href).toMatch(/\/3rdloop\/security\/access-reviews\/ar_/)
    expect(review?.detail).toMatch(/^6 of 11 decided/)
    const secret = body.attention.items.find((i) => i.kind === 'secret_rotation')
    expect(secret?.href).toMatch(/\/3rdloop\/security\/secrets\?q=SCR-/)
  })
})
