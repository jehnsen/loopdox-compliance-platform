// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  AgreementSummary,
  AuditEvent,
  DsrDetail,
  DsrSummary,
  IncidentReceipt,
  IncidentSummary,
  LinksResponse,
  ListResponse,
  NotificationList,
  PiaSummary,
  ProcessingActivitySummary,
  RecordRef,
  SearchResponse,
  TokenPair,
} from '@/lib/api/types'
import { addDaysToDate } from '@/lib/privacy'
import { todayInTz } from '@/lib/utils/dates'
import { dispatchMock } from '@/mocks/dispatch'
import { getDb, resetDb } from '@/mocks/store'

// Seeded at the real time: request handlers use the real clock, so day counts must agree.
const NOW = new Date()
const HOUR = 3_600_000
const users = {
  dpo: 'jehnsen.enrique@3rdloop.example',
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
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  return { status: res.status, body: parsed as T }
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
    dpo: await login(users.dpo),
    approver: await login(users.approver),
    staff: await login(users.staff),
    auditor: await login(users.auditor),
    clinic: await login(users.clinic),
  }
})

const incident = (id: string, token = t.dpo) =>
  call<IncidentSummary>(token, 'GET', `/incidents/${id}`)

describe('incidents: the 72-hour clock', () => {
  it('starts at discoveredAt + 72 h when staff report a breach with personal data', async () => {
    const discoveredAt = new Date(Date.now() - 2 * HOUR).toISOString()
    const res = await call<IncidentReceipt>(t.staff, 'POST', '/incidents', {
      title: 'Laptop left in a taxi',
      description: 'A work laptop with client exports was left in a taxi.',
      discoveredAt,
      affectedSummary: 'Laptop with client exports',
      personalDataInvolved: true,
    })
    expect(res.status).toBe(201)
    expect(res.body.ref).toMatch(/^INC-\d{4}-0004$/)
    expect(Date.parse(res.body.notificationDeadline ?? '')).toBe(
      Date.parse(discoveredAt) + 72 * HOUR,
    )

    // Staff can report but can't open the record; the DPO can, and is notified.
    expect((await incident(res.body.id, t.staff)).status).toBe(403)
    const seen = await incident(res.body.id)
    expect(seen.body.status).toBe('reported')
    expect(seen.body.reportedByName).toBe('Staff Member')
    const bell = await call<NotificationList>(t.dpo, 'GET', '/notifications')
    expect(bell.body.items[0]?.title).toContain(res.body.ref)
  })

  it('has no clock without personal data, and recomputes it when triage changes the facts', async () => {
    const res = await call<IncidentReceipt>(t.dpo, 'POST', '/incidents', {
      title: 'Phishing email reported',
      description: 'A phishing email reached three inboxes. Nobody clicked.',
      discoveredAt: new Date(Date.now() - HOUR).toISOString(),
      affectedSummary: '',
      personalDataInvolved: false,
    })
    expect(res.body.notificationDeadline).toBeNull()
    const before = await incident(res.body.id)
    const discoveredAt = new Date(Date.now() - 10 * HOUR).toISOString()
    const after = await call<IncidentSummary>(t.dpo, 'PATCH', `/incidents/${res.body.id}`, {
      ifVersion: before.body.version,
      personalDataInvolved: true,
      discoveredAt,
    })
    expect(after.body.status).toBe('triage')
    expect(Date.parse(after.body.notificationDeadline ?? '')).toBe(
      Date.parse(discoveredAt) + 72 * HOUR,
    )
  })

  it('rejects a discovery time in the future', async () => {
    const res = await call(t.staff, 'POST', '/incidents', {
      title: 'Future',
      description: 'This has not happened yet.',
      discoveredAt: new Date(Date.now() + 2 * HOUR).toISOString(),
      affectedSummary: '',
      personalDataInvolved: true,
    })
    expect(res.status).toBe(400)
  })

  it('seeds an open breach whose clock started 30 hours before now', async () => {
    const res = await incident('inc_2026_0003')
    expect(res.body.notificationRequired).toBeNull()
    expect(Date.parse(res.body.notificationDeadline ?? '') - NOW.getTime()).toBe(42 * HOUR)
  })
})

describe('incidents: notices, sign-off and notification', () => {
  it('pre-fills notices from linked records, needs an approver, and stops the clock when NPC is notified', async () => {
    const id = 'inc_2026_0003'
    // Act as a DPO who isn't also an admin (admins may sign off too).
    const membership = getDb().memberships.find((m) => m.id === 'mem_3l_jehnsen')
    if (membership) membership.roles = ['dpo']
    // Link another processing record and record the triage decision.
    expect(
      (
        await call(t.dpo, 'POST', '/links', {
          from: { type: 'incident', id },
          to: { type: 'processing_activity', id: 'pa_005' },
        })
      ).status,
    ).toBe(204)
    let inc = await incident(id)
    inc = await call<IncidentSummary>(t.dpo, 'PATCH', `/incidents/${id}`, {
      ifVersion: inc.body.version,
      affectedCount: 120,
      notificationRequired: true,
      notificationRationale: 'Customer contact details were publicly readable.',
    })
    expect(inc.status).toBe(200)

    // Recording a notification before sign-off is refused.
    const early = await call(t.dpo, 'POST', `/incidents/${id}/notifications`, {
      ifVersion: inc.body.version,
      kind: 'npc',
      at: NOW.toISOString(),
    })
    expect(early.status).toBe(422)

    inc = await call<IncidentSummary>(t.dpo, 'POST', `/incidents/${id}/notices/draft`, {
      ifVersion: inc.body.version,
    })
    const npc = inc.body.notices?.npc.body ?? ''
    expect(npc).toContain('PA-002 Client project delivery')
    expect(npc).toContain('PA-005 IT security monitoring and access logs')
    expect(npc).toContain('Health information held in client systems')
    expect(npc).toContain('Client project database')
    expect(npc).toContain('about 120')
    expect(npc).toContain('NPC-REG-2025-04127')
    expect(inc.body.notices?.subjects.body).toContain(
      'Dear client staff, clients’ customers, employees and contractors,',
    )
    expect(inc.body.notices?.signedOffAt).toBeNull()

    // The approver is notified; the DPO can’t sign off; the approver can.
    const bell = await call<NotificationList>(t.approver, 'GET', '/notifications')
    expect(bell.body.items.some((n) => n.title.includes('ready for your sign-off'))).toBe(true)
    const denied = await call(t.dpo, 'POST', `/incidents/${id}/notices/sign-off`, {
      ifVersion: inc.body.version,
    })
    expect(denied.status).toBe(403)
    inc = await call<IncidentSummary>(t.approver, 'POST', `/incidents/${id}/notices/sign-off`, {
      ifVersion: inc.body.version,
    })
    expect(inc.body.notices?.signedOffByName).toBe('Michael Manabat')

    const at = new Date(NOW.getTime() - 60_000).toISOString()
    inc = await call<IncidentSummary>(t.dpo, 'POST', `/incidents/${id}/notifications`, {
      ifVersion: inc.body.version,
      kind: 'npc',
      at,
      reference: 'NPC-BN-1001',
    })
    expect(inc.body.status).toBe('notified')
    expect(inc.body.npcNotifiedAt).toBe(at)
    expect(inc.body.npcReference).toBe('NPC-BN-1001')

    // The notices are final once the NPC has them.
    const edit = await call(t.dpo, 'PATCH', `/incidents/${id}/notices`, {
      ifVersion: inc.body.version,
      npc: { subject: 'Changed', body: 'This is a changed notice body.' },
    })
    expect(edit.status).toBe(422)

    const closed = await call<IncidentSummary>(t.dpo, 'PATCH', `/incidents/${id}`, {
      ifVersion: inc.body.version,
      status: 'closed',
    })
    expect(closed.body.status).toBe('closed')

    const events = await call<ListResponse<AuditEvent>>(
      t.dpo,
      'GET',
      `/audit-events?targetType=incident&targetId=${id}`,
    )
    const actions = events.body.items.map((e) => e.action)
    expect(actions).toEqual(
      expect.arrayContaining([
        'incident.linked',
        'incident.triaged',
        'incident.notices_drafted',
        'incident.notices_signed_off',
        'incident.npc_notified',
        'incident.closed',
      ]),
    )
  })

  it('clears the sign-off when signed notices are edited', async () => {
    const id = 'inc_2026_0003'
    let inc = await incident(id)
    inc = await call<IncidentSummary>(t.dpo, 'PATCH', `/incidents/${id}`, {
      ifVersion: inc.body.version,
      notificationRequired: true,
      notificationRationale: 'Real risk of serious harm.',
    })
    inc = await call<IncidentSummary>(t.dpo, 'POST', `/incidents/${id}/notices/draft`, {
      ifVersion: inc.body.version,
    })
    inc = await call<IncidentSummary>(t.approver, 'POST', `/incidents/${id}/notices/sign-off`, {
      ifVersion: inc.body.version,
    })
    expect(inc.body.notices?.signedOffAt).not.toBeNull()
    inc = await call<IncidentSummary>(t.dpo, 'PATCH', `/incidents/${id}/notices`, {
      ifVersion: inc.body.version,
      npc: { subject: 'Updated subject', body: 'Updated body with enough words in it.' },
    })
    expect(inc.body.notices?.npc.subject).toBe('Updated subject')
    expect(inc.body.notices?.signedOffAt).toBeNull()
  })

  it('won’t close an undecided breach or sign off before triage decides', async () => {
    const id = 'inc_2026_0003'
    let inc = await incident(id)
    const close = await call(t.dpo, 'PATCH', `/incidents/${id}`, {
      ifVersion: inc.body.version,
      status: 'closed',
    })
    expect(close.status).toBe(422)
    inc = await call<IncidentSummary>(t.dpo, 'POST', `/incidents/${id}/notices/draft`, {
      ifVersion: inc.body.version,
    })
    const sign = await call(t.approver, 'POST', `/incidents/${id}/notices/sign-off`, {
      ifVersion: inc.body.version,
    })
    expect(sign.status).toBe(422)
  })

  it('creates a risk from the post-incident review and links it back', async () => {
    const res = await call<{ id: string; ref: string }>(t.dpo, 'POST', '/risks', {
      title: 'Storage containers can be made public',
      description: 'Nothing stops a container being switched to anonymous access.',
      likelihood: 3,
      impact: 4,
      owner: 'usr_jehnsen',
      incidentId: 'inc_2026_0003',
    })
    expect(res.status).toBe(201)
    expect(res.body.ref).toBe('RISK-013')
    const links = await call<LinksResponse>(t.dpo, 'GET', '/links?type=incident&id=inc_2026_0003')
    expect(links.body.groups.find((g) => g.type === 'risk')?.items.map((i) => i.ref)).toEqual([
      'RISK-013',
    ])
  })
})

describe('auditors see finalised privacy records only', () => {
  it('filters lists and hides drafts', async () => {
    const pa = await call<ListResponse<ProcessingActivitySummary>>(
      t.auditor,
      'GET',
      '/processing-activities?pageSize=200',
    )
    expect(pa.body.items.map((p) => p.ref)).not.toContain('PA-003')
    expect(pa.body.items).toHaveLength(5)
    const inc = await call<ListResponse<IncidentSummary>>(t.auditor, 'GET', '/incidents')
    expect(inc.body.items.map((i) => i.id)).toEqual(['inc_2026_0002'])
    expect((await incident('inc_2026_0003', t.auditor)).status).toBe(404)
    const dsrs = await call<ListResponse<DsrSummary>>(t.auditor, 'GET', '/dsrs')
    expect(dsrs.body.items.map((d) => d.status)).toEqual(['closed'])
    const pias = await call<ListResponse<PiaSummary>>(t.auditor, 'GET', '/pias')
    expect(pias.body.items.map((p) => p.ref)).toEqual(['PIA-001'])
    expect((await call(t.auditor, 'POST', '/dsrs', {})).status).toBe(403)
  })

  it('keeps staff out of the registers', async () => {
    expect((await call(t.staff, 'GET', '/processing-activities')).status).toBe(403)
    expect((await call(t.staff, 'GET', '/incidents')).status).toBe(403)
  })
})

describe('data subject requests', () => {
  it('computes the due date from the tenant setting and masks the requester', async () => {
    const receivedAt = todayInTz('Asia/Manila')
    const res = await call<DsrDetail>(t.dpo, 'POST', '/dsrs', {
      type: 'access',
      requesterName: 'Juan Santos Reyes',
      requesterContact: 'juan.reyes@mail.example',
      channel: 'email',
      description: 'Wants a copy of their data.',
      receivedAt,
      assignee: 'usr_jehnsen',
      processingActivityIds: ['pa_002'],
    })
    expect(res.status).toBe(201)
    expect(res.body.ref).toMatch(/^DSR-\d{4}-0013$/)
    expect(res.body.dueAt).toBe(addDaysToDate(receivedAt, 30))
    expect(res.body.requesterName).toBe('J•••• S•••• R••••')
    expect(res.body.requesterContact).toBe('j••••@mail.example')
    expect(JSON.stringify(res.body)).not.toContain('Juan')
    expect(res.body.events.map((e) => e.status)).toEqual(['received'])
  })

  it('flags the seeded request due in 2 days', async () => {
    const res = await call<DsrDetail>(t.dpo, 'GET', '/dsrs/dsr_2026_0012')
    expect(res.body.daysLeft).toBe(2)
    expect(res.body.dueState).toBe('due_soon')
    const due = await call<ListResponse<DsrSummary>>(t.dpo, 'GET', '/dsrs?due=due_soon,overdue')
    expect(due.body.items.map((d) => d.id)).toEqual(['dsr_2026_0012'])
  })

  it('reveals a masked value only to permitted roles, and audits every reveal', async () => {
    const body = { targetType: 'dsr', targetId: 'dsr_2026_0012', field: 'requesterContact' }
    const ok = await call<{ value: string }>(t.dpo, 'POST', '/sensitive/reveal', body)
    expect(ok.body.value).toBe('mcdelacruz@mail.example')
    expect((await call(t.approver, 'POST', '/sensitive/reveal', body)).status).toBe(403)
    expect((await call(t.auditor, 'POST', '/sensitive/reveal', body)).status).toBe(403)
    const events = await call<ListResponse<AuditEvent>>(
      t.dpo,
      'GET',
      '/audit-events?targetType=dsr&targetId=dsr_2026_0012',
    )
    const reveal = events.body.items.find((e) => e.action === 'sensitive.revealed')
    expect(reveal?.details).toEqual({ field: 'requesterContact' })
    expect(JSON.stringify(reveal)).not.toContain('mcdelacruz')
  })

  it('moves through the timeline in order and needs an outcome to respond', async () => {
    let d = await call<DsrDetail>(t.dpo, 'GET', '/dsrs/dsr_2026_0011')
    const skip = await call(t.dpo, 'POST', '/dsrs/dsr_2026_0011/transition', {
      ifVersion: d.body.version,
      status: 'in_progress',
    })
    expect(skip.status).toBe(422)
    for (const status of ['identity_verified', 'in_progress'] as const) {
      d = await call<DsrDetail>(t.dpo, 'POST', '/dsrs/dsr_2026_0011/transition', {
        ifVersion: d.body.version,
        status,
      })
    }
    expect(d.body.identityVerified).toBe(true)
    const noOutcome = await call(t.dpo, 'POST', '/dsrs/dsr_2026_0011/transition', {
      ifVersion: d.body.version,
      status: 'responded',
    })
    expect(noOutcome.status).toBe(400)
    d = await call<DsrDetail>(t.dpo, 'POST', '/dsrs/dsr_2026_0011/transition', {
      ifVersion: d.body.version,
      status: 'responded',
      outcome: 'granted',
      note: 'Records corrected.',
    })
    expect(d.body.dueState).toBeNull()
    expect(d.body.events.map((e) => e.status)).toEqual([
      'received',
      'identity_verified',
      'in_progress',
      'responded',
    ])
  })
})

describe('processing records', () => {
  it('derives warning chips', async () => {
    const list = await call<ListResponse<ProcessingActivitySummary>>(
      t.dpo,
      'GET',
      '/processing-activities?pageSize=200',
    )
    const by = Object.fromEntries(list.body.items.map((p) => [p.ref, p]))
    expect(by['PA-002']?.warnings).toEqual([])
    expect(by['PA-002']?.piaRef).toBe('PIA-001')
    expect(by['PA-001']?.warnings).toEqual(['no_pia'])
    expect(by['PA-003']?.warnings).toEqual(['no_retention'])
    expect(by['PA-004']?.warnings).toEqual(['no_pia', 'no_agreement'])
    expect(by['PA-004']?.recipientsWithoutAgreement).toEqual(['Liham Mailer Co.'])
    const flagged = await call<ListResponse<ProcessingActivitySummary>>(
      t.dpo,
      'GET',
      '/processing-activities?warning=no_agreement',
    )
    expect(flagged.body.items.map((p) => p.ref)).toEqual(['PA-004'])
  })

  it('exports the register as CSV', async () => {
    const res = await call<string>(t.dpo, 'GET', '/processing-activities/export')
    expect(res.status).toBe(200)
    expect(res.body.split('\n')[0]).toContain('Legal basis')
    expect(res.body).toContain('PA-006')
  })
})

describe('linked records', () => {
  it('groups links in both directions and hides modules outside the plan', async () => {
    const res = await call<LinksResponse>(t.dpo, 'GET', '/links?type=processing_activity&id=pa_002')
    const groups = Object.fromEntries(res.body.groups.map((g) => [g.type, g]))
    expect(groups.system?.items).toHaveLength(4)
    expect(groups.agreement?.items.map((i) => i.ref)).toEqual(['AGR-001'])
    expect(groups.pia?.items.map((i) => i.ref)).toEqual(['PIA-001'])
    expect(groups.pia?.linkable).toBe(false)
    expect(groups.dsr?.items.map((i) => [i.ref, i.direction])).toEqual([['DSR-2026-0012', 'from']])
    expect(groups.incident?.items.map((i) => i.id)).toEqual(['inc_2026_0003'])
    expect(groups.dsr?.items[0]?.title).toBe('Access request')

    const clinic = await call<LinksResponse>(
      t.clinic,
      'GET',
      '/links?type=processing_activity&id=pa_sc_001',
      undefined,
      'sample-clinic',
    )
    expect(clinic.body.groups.map((g) => g.type)).not.toContain('system')
  })

  it('adds and removes links, and offers only unlinked candidates', async () => {
    const link = {
      from: { type: 'processing_activity', id: 'pa_004' },
      to: { type: 'agreement', id: 'agr_003' },
    }
    expect((await call(t.dpo, 'POST', '/links', link)).status).toBe(204)
    const cands = await call<{ items: RecordRef[] }>(
      t.dpo,
      'GET',
      '/links/candidates?type=agreement&for=processing_activity:pa_004',
    )
    expect(cands.body.items.map((c) => c.ref)).not.toContain('AGR-003')
    expect((await call(t.approver, 'POST', '/links', link)).status).toBe(403)
    const del = await call(
      t.dpo,
      'DELETE',
      '/links?fromType=processing_activity&fromId=pa_004&toType=agreement&toId=agr_003',
    )
    expect(del.status).toBe(204)
    const managed = await call(t.dpo, 'POST', '/links', {
      from: { type: 'processing_activity', id: 'pa_001' },
      to: { type: 'pia', id: 'pia_001' },
    })
    expect(managed.status).toBe(422)
  })
})

describe('impact assessments', () => {
  it('saves per step and signs off only when every risk has a mitigation', async () => {
    let pia = await call<PiaSummary>(t.dpo, 'POST', '/pias', {
      processingActivityId: 'pa_001',
      scope: 'Payroll processing by the outsourced provider.',
    })
    expect(pia.body.currentStep).toBe(2)
    pia = await call<PiaSummary>(t.dpo, 'PATCH', `/pias/${pia.body.id}`, {
      ifVersion: pia.body.version,
      currentStep: 4,
      risks: [
        {
          id: 'r1',
          description: 'Provider breach exposes IDs',
          likelihood: 2,
          impact: 5,
          mitigation: '',
        },
        {
          id: 'r2',
          description: 'Payslips emailed to old addresses',
          likelihood: 3,
          impact: 2,
          mitigation: '',
        },
      ],
    })
    expect(pia.body.overallScore).toBe(10)
    expect(pia.body.currentStep).toBe(4)
    const early = await call(t.dpo, 'POST', `/pias/${pia.body.id}/sign-off`, {
      ifVersion: pia.body.version,
      decision: 'proceed',
    })
    expect(early.status).toBe(422)
    pia = await call<PiaSummary>(t.dpo, 'PATCH', `/pias/${pia.body.id}`, {
      ifVersion: pia.body.version,
      risks: pia.body.risks.map((r) => ({ ...r, mitigation: 'Contractual controls and audits.' })),
    })
    const conditions = await call(t.dpo, 'POST', `/pias/${pia.body.id}/sign-off`, {
      ifVersion: pia.body.version,
      decision: 'proceed_with_conditions',
    })
    expect(conditions.status).toBe(400)
    pia = await call<PiaSummary>(t.dpo, 'POST', `/pias/${pia.body.id}/sign-off`, {
      ifVersion: pia.body.version,
      decision: 'proceed',
    })
    expect(pia.body.status).toBe('signed_off')
    expect(pia.body.signedOffByName).toBe('Jehnsen Enrique')
    const locked = await call(t.dpo, 'PATCH', `/pias/${pia.body.id}`, {
      ifVersion: pia.body.version,
      scope: 'Changed after sign-off',
    })
    expect(locked.status).toBe(422)
    const pa = await call<ProcessingActivitySummary>(t.dpo, 'GET', '/processing-activities/pa_001')
    expect(pa.body.warnings).not.toContain('no_pia')
  })
})

describe('agreements, registration, training, search', () => {
  it('flags renewals within 30 days and syncs linked processing records', async () => {
    const list = await call<ListResponse<AgreementSummary>>(
      t.dpo,
      'GET',
      '/agreements?renewal=due_soon',
    )
    expect(list.body.items.map((a) => [a.ref, a.daysToRenewal])).toEqual([['AGR-001', 28]])
    const created = await call<AgreementSummary>(t.dpo, 'POST', '/agreements', {
      counterparty: 'Liham Mailer Co.',
      type: 'dpa',
      role: 'we_are_controller',
      signedAt: todayInTz('Asia/Manila'),
      renewsAt: null,
      fileId: null,
      owner: 'usr_jehnsen',
      notes: '',
      processingActivityIds: ['pa_004'],
    })
    expect(created.body.ref).toBe('AGR-006')
    expect(created.body.processingActivityIds).toEqual(['pa_004'])
    const pa = await call<ProcessingActivitySummary>(t.dpo, 'GET', '/processing-activities/pa_004')
    expect(pa.body.warnings).not.toContain('no_agreement')
  })

  it('keeps one NPC registration per organisation', async () => {
    const list = await call<ListResponse<{ status: string; daysToRenewal: number }>>(
      t.dpo,
      'GET',
      '/registrations',
    )
    expect(list.body.items[0]?.status).toBe('registered')
    const dup = await call(t.dpo, 'POST', '/registrations', {
      reference: 'NPC-REG-X',
      dpoName: 'Someone',
      dpoEmail: 'dpo@3rdloop.example',
      registeredAt: '2026-01-01',
      renewsAt: '2027-01-01',
      notes: '',
    })
    expect(dup.status).toBe(422)
    const clinic = await call<ListResponse<{ status: string }>>(
      t.clinic,
      'GET',
      '/registrations',
      undefined,
      'sample-clinic',
    )
    expect(clinic.body.items[0]?.status).toBe('renewal_due')
  })

  it('reports training states', async () => {
    const res = await call<ListResponse<{ userId: string; course: string; state: string }>>(
      t.dpo,
      'GET',
      '/training-records?pageSize=200',
    )
    const michael = res.body.items.find(
      (r) => r.userId === 'usr_michael' && r.course === 'Data Privacy Act essentials',
    )
    expect(michael?.state).toBe('expired')
    expect(
      res.body.items.find((r) => r.userId === 'usr_staff' && r.course.startsWith('Data'))?.state,
    ).toBe('expiring')
  })

  it('finds privacy records by reference but never by requester name', async () => {
    const hit = await call<SearchResponse>(t.dpo, 'GET', '/search?q=dsr-2026-0012')
    expect(hit.body.groups.map((g) => g.type)).toEqual(['dsr'])
    const name = await call<SearchResponse>(t.dpo, 'GET', '/search?q=Dela Cruz')
    expect(name.body.groups).toEqual([])
    const inc = await call<SearchResponse>(t.dpo, 'GET', '/search?q=storage container')
    expect(inc.body.groups[0]?.items[0]?.ref).toMatch(/INC-\d{4}-0003/)
  })
})
