// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  AuditEvent,
  AuditPack,
  Connector,
  ConnectorRunResult,
  ControlSummary,
  EvidenceItem,
  ListResponse,
  OverviewResponse,
  SearchResponse,
  TokenPair,
  Usage,
} from '@/lib/api/types'
import { controlStatusFrom, periodRange } from '@/lib/evidence'
import { todayInTz } from '@/lib/utils/dates'
import { dispatchMock } from '@/mocks/dispatch'
import { getDb, resetDb } from '@/mocks/store'

const NOW = new Date()
const users = {
  admin: 'jehnsen.enrique@3rdloop.example',
  approver: 'michael.manabat@3rdloop.example',
  staff: 'staff@3rdloop.example',
  auditor: 'auditor@audit-firm.example',
  clinic: 'liza.santos@sample-clinic.example',
}

async function send(token: string, method: string, path: string, body?: BodyInit, json = false) {
  const res = await dispatchMock(
    new Request(`http://mock.local/api/v1/orgs/3rdloop${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(json ? { 'content-type': 'application/json' } : {}),
      },
      body,
    }),
  )
  return res
}

async function call<T = unknown>(token: string, method: string, path: string, body?: unknown) {
  const res = await send(token, method, path, body ? JSON.stringify(body) : undefined, true)
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

interface UploadFields {
  controlId: string
  summary?: string
  result?: string
  collectedOn?: string
  file?: File | null
}

/** POST /evidence as the browser sends it: multipart with the file beside the fields. */
async function upload(token: string, f: UploadFields) {
  const form = new FormData()
  form.set('controlId', f.controlId)
  form.set(
    'summary',
    f.summary ?? 'Quarterly restore test: the staging database came back in 52 minutes.',
  )
  form.set('result', f.result ?? 'pass')
  if (f.collectedOn) form.set('collectedOn', f.collectedOn)
  if (f.file !== null) {
    form.set('file', f.file ?? new File(['proof'], 'restore-test.pdf', { type: 'application/pdf' }))
  }
  const res = await send(token, 'POST', '/evidence', form)
  const text = await res.text()
  return {
    status: res.status,
    body: JSON.parse(text) as EvidenceItem & { error?: { fields?: Record<string, string> } },
  }
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

const controls = async (token = t.admin, query = '') =>
  (await call<ListResponse<ControlSummary>>(token, 'GET', `/controls?pageSize=100${query}`)).body
    .items
const byRef = async (ref: string) => {
  const found = (await controls()).find((c) => c.reference === ref)
  if (!found) throw new Error(`No control ${ref}`)
  return found
}
const refs = (items: { reference: string }[]) => items.map((c) => c.reference)

describe('seed', () => {
  it('judges every control from its own evidence history', () => {
    const db = getDb()
    expect(db.controls).toHaveLength(30)
    for (const c of db.controls) {
      const own = db.evidence.filter((e) => e.controlId === c.id)
      expect(controlStatusFrom('passing', own), `${c.reference} has ${own.length} items`).toBe(
        c.status,
      )
    }
  })

  it('keeps the access control to the one item its signed-off review made', () => {
    const db = getDb()
    const a515 = db.controls.find((c) => c.reference === 'A.5.15')
    expect(db.evidence.filter((e) => e.controlId === a515?.id)).toHaveLength(1)
  })

  it('has three connectors in use, one of them failing, and Azure waiting', async () => {
    const { body } = await call<ListResponse<Connector>>(t.admin, 'GET', '/connectors')
    expect(body.items.map((c) => [c.provider, c.status])).toEqual([
      ['github', 'connected'],
      ['azure', 'disconnected'],
      ['google_workspace', 'connected'],
      ['hostinger', 'error'],
    ])
    const hostinger = body.items.find((c) => c.provider === 'hostinger')
    expect(hostinger?.lastError?.fixHint).toMatch(/Reconfigure/)
  })

  it('counts the connectors in use against the plan', async () => {
    const res = await dispatchMock(
      new Request('http://mock.local/api/v1/me?org=3rdloop', {
        headers: { authorization: `Bearer ${t.admin}` },
      }),
    )
    const body = (await res.json()) as { usage: Usage }
    expect(body.usage.connectors).toEqual({ used: 3, limit: null })
  })
})

describe('controls', () => {
  it('lists ISO 27001 first, then the Data Privacy Act and NPC, with natural reference order', async () => {
    const items = await controls()
    expect(items.map((c) => c.framework).filter((f, i, a) => a.indexOf(f) === i)).toEqual([
      'ISO27001:2022',
      'DPA',
      'NPC',
    ])
    const iso = refs(items.filter((c) => c.framework === 'ISO27001:2022'))
    expect(iso.slice(0, 5)).toEqual(['A.5.1', 'A.5.2', 'A.5.9', 'A.5.10', 'A.5.12'])
  })

  it('filters to what needs work: failing, or no evidence', async () => {
    const failing = await controls(t.admin, '&status=failing')
    expect(refs(failing)).toEqual(['A.5.17', 'A.5.30'])
    const none = await controls(t.admin, '&status=no_evidence')
    expect(refs(none)).toEqual(['A.5.23', 'A.5.37', 'A.8.15'])
    expect(none.every((c) => c.evidenceCount === 0 && c.lastEvidenceAt === null)).toBe(true)
  })

  it('shows the evidence count, last evidence and the connectors that feed a control', async () => {
    const c = await byRef('A.5.17')
    expect(c.evidenceCount).toBe(3)
    expect(c.connectors.map((x) => x.provider)).toEqual(['google_workspace'])
    expect(c.ownerName).toBe('Jehnsen Enrique')
    expect(Date.parse(c.lastEvidenceAt ?? '')).toBeGreaterThan(NOW.getTime() - 5 * 3_600_000)
  })

  it('gives auditors only the approved policies', async () => {
    // A.8.25 links ITD-010, which has never been approved.
    const admin = await byRef('A.8.25')
    expect(admin.documentIds).toHaveLength(1)
    const forAuditor = (await controls(t.auditor)).find((c) => c.reference === 'A.8.25')
    expect(forAuditor?.documentIds).toEqual([])
  })

  it('needs the Evidence plan and permission', async () => {
    expect((await call(t.staff, 'GET', '/controls')).status).toBe(403)
    const clinic = await dispatchMock(
      new Request('http://mock.local/api/v1/orgs/sample-clinic/controls', {
        headers: { authorization: `Bearer ${t.clinic}` },
      }),
    )
    expect(clinic.status).toBe(403)
    expect((await clinic.json()).error.code).toBe('feature_not_in_plan')
  })
})

describe('uploading evidence', () => {
  it('records the file as evidence and re-judges the control', async () => {
    const logging = await byRef('A.8.15')
    expect(logging.status).toBe('no_evidence')
    const { status, body } = await upload(t.admin, { controlId: logging.id, result: 'pass' })
    expect(status).toBe(201)
    expect(body).toMatchObject({
      source: 'upload',
      result: 'pass',
      controlReference: 'A.8.15',
      collectedByName: 'Jehnsen Enrique',
      file: { name: 'restore-test.pdf' },
    })
    expect((await byRef('A.8.15')).status).toBe('passing')
    expect((await byRef('A.8.15')).evidenceCount).toBe(1)
  })

  it('turns a passing control red on a failing upload, and back on newer proof', async () => {
    const backup = await byRef('A.8.13')
    expect(backup.status).toBe('passing')
    await upload(t.admin, {
      controlId: backup.id,
      result: 'fail',
      summary: 'The restore test failed twice.',
    })
    expect((await byRef('A.8.13')).status).toBe('failing')
    await upload(t.admin, {
      controlId: backup.id,
      result: 'pass',
      summary: 'The restore test passed after the fix.',
    })
    expect((await byRef('A.8.13')).status).toBe('passing')
  })

  it('does not let info evidence, or older evidence, change the status', async () => {
    const backup = await byRef('A.8.13')
    await upload(t.admin, {
      controlId: backup.id,
      result: 'info',
      summary: 'Meeting notes about the backup plan.',
    })
    expect((await byRef('A.8.13')).status).toBe('passing')
    // A failure dated before the latest pass is history, not the current state.
    const old = todayInTz('Asia/Manila', new Date(NOW.getTime() - 400 * 86_400_000))
    await upload(t.admin, {
      controlId: backup.id,
      result: 'fail',
      collectedOn: old,
      summary: 'An old failing test from last year.',
    })
    expect((await byRef('A.8.13')).status).toBe('passing')
  })

  it('refuses what is not valid, saying which field', async () => {
    const c = await byRef('A.8.15')
    const noFile = await upload(t.admin, { controlId: c.id, file: null })
    expect(noFile.status).toBe(400)
    expect(noFile.body.error?.fields?.file).toBeDefined()

    const exe = new File(['x'], 'run.exe', { type: 'application/x-msdownload' })
    expect((await upload(t.admin, { controlId: c.id, file: exe })).status).toBe(400)

    const short = await upload(t.admin, { controlId: c.id, summary: 'ok' })
    expect(short.body.error?.fields?.summary).toMatch(/at least 10/)

    const future = todayInTz('Asia/Manila', new Date(NOW.getTime() + 3 * 86_400_000))
    const late = await upload(t.admin, { controlId: c.id, collectedOn: future })
    expect(late.body.error?.fields?.collectedOn).toMatch(/earlier date/)

    const unknown = await upload(t.admin, { controlId: 'ctl_nope' })
    expect(unknown.body.error?.fields?.controlId).toBeDefined()
    expect((await byRef('A.8.15')).evidenceCount).toBe(0)
  })

  it('is for people who can edit evidence', async () => {
    const c = await byRef('A.8.15')
    expect((await upload(t.auditor, { controlId: c.id })).status).toBe(403)
    expect((await upload(t.approver, { controlId: c.id })).status).toBe(403)
    expect((await upload(t.staff, { controlId: c.id })).status).toBe(403)
    expect((await byRef('A.8.15')).evidenceCount).toBe(0)
  })

  it('lists uploads org-wide and finds evidence in search and the audit log', async () => {
    const c = await byRef('A.8.15')
    await upload(t.admin, {
      controlId: c.id,
      summary: 'Log retention screenshot from the SIEM dashboard.',
    })
    const uploads = await call<ListResponse<EvidenceItem>>(
      t.admin,
      'GET',
      '/evidence?source=upload&q=siem',
    )
    expect(uploads.body.items).toHaveLength(1)
    const all = await call<ListResponse<EvidenceItem>>(t.admin, 'GET', '/evidence?pageSize=200')
    expect(all.body.total).toBe(getDb().evidence.filter((e) => e.orgId === 'org_3rdloop').length)

    const search = await call<SearchResponse>(t.auditor, 'GET', '/search?q=siem')
    expect(search.body.groups.map((g) => g.type)).toEqual(['evidence'])
    expect(search.body.groups[0]?.items[0]?.href).toMatch(/\/evidence\/controls\/ctl_a_8_15#evd_/)

    const events = await call<ListResponse<AuditEvent>>(t.admin, 'GET', '/audit-events?pageSize=5')
    expect(events.body.items[0]).toMatchObject({
      action: 'evidence.uploaded',
      targetType: 'control',
    })
  })
})

describe('connectors', () => {
  const run = (id: string, token = t.admin) =>
    call<ConnectorRunResult>(token, 'POST', `/connectors/${id}/run`)

  it('records one evidence item per check when a connected connector runs', async () => {
    const before = (await byRef('A.8.32')).evidenceCount
    const { status, body } = await run('con_github')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.evidence.map((e) => e.controlReference).sort()).toEqual(['A.8.25', 'A.8.32'])
    expect(
      body.evidence.every((e) => e.source === 'connector' && e.connectorName === 'GitHub'),
    ).toBe(true)
    expect(body.evidence.every((e) => e.collectedByName === null)).toBe(true)
    expect((await byRef('A.8.32')).evidenceCount).toBe(before + 1)
  })

  it('keeps a control failing when its check fails again', async () => {
    const { body } = await run('con_google_workspace')
    const twoStep = body.evidence.find((e) => e.controlReference === 'A.5.17')
    expect(twoStep?.result).toBe('fail')
    expect(twoStep?.summary).toMatch(/2 of 14 accounts/)
    expect((await byRef('A.5.17')).status).toBe('failing')
  })

  it('fails to run a connector in error, collects nothing, and keeps the fix hint', async () => {
    const before = getDb().evidence.length
    const { status, body } = await run('con_hostinger')
    expect(status).toBe(200)
    expect(body.ok).toBe(false)
    expect(body.evidence).toEqual([])
    expect(body.connector.status).toBe('error')
    expect(body.connector.lastError?.message).toMatch(/rejected/)
    expect(getDb().evidence).toHaveLength(before)
  })

  it('reconfiguring clears the error, drops the Needs attention item and lets it run', async () => {
    const overview = async () =>
      (await call<OverviewResponse>(t.admin, 'GET', '/overview')).body.attention.counts
    expect((await overview()).connector_failing).toBe(1)

    const hostinger = (await call<Connector>(t.admin, 'GET', '/connectors/con_hostinger')).body
    const fixed = await call<Connector>(t.admin, 'PATCH', '/connectors/con_hostinger', {
      ifVersion: hostinger.version,
      status: 'connected',
      account: 'ops@3rdloop.example',
    })
    expect(fixed.status).toBe(200)
    expect(fixed.body).toMatchObject({ status: 'connected', lastError: null })
    expect((await overview()).connector_failing).toBeUndefined()

    const ran = await run('con_hostinger')
    expect(ran.body.ok).toBe(true)
    expect(ran.body.evidence.map((e) => e.controlReference).sort()).toEqual(['A.8.13', 'A.8.24'])
  })

  it('connecting Azure and running it gives Logging its first evidence', async () => {
    expect((await byRef('A.8.15')).status).toBe('no_evidence')
    const azure = (await call<Connector>(t.admin, 'GET', '/connectors/azure')).body
    const connected = await call<Connector>(t.admin, 'PATCH', `/connectors/${azure.id}`, {
      ifVersion: azure.version,
      status: 'connected',
      account: '3rdloop.onmicrosoft.com',
    })
    expect(connected.body.status).toBe('connected')
    expect((await run(azure.id)).body.ok).toBe(true)
    expect((await byRef('A.8.15')).status).toBe('passing')
  })

  it('will not run a connector that is not connected', async () => {
    const { status, body } = await call<{ error: { message: string } }>(
      t.admin,
      'POST',
      '/connectors/con_azure/run',
    )
    expect(status).toBe(422)
    expect(body.error.message).toMatch(/isn’t connected/)
  })

  it('refuses a credential instead of dropping it', async () => {
    const azure = (await call<Connector>(t.admin, 'GET', '/connectors/azure')).body
    for (const field of ['token', 'apiKey', 'password', 'clientSecret']) {
      const res = await call<{ error: { fields: Record<string, string> } }>(
        t.admin,
        'PATCH',
        `/connectors/${azure.id}`,
        { ifVersion: azure.version, status: 'connected', account: 'tenant', [field]: 'abc123' },
      )
      expect(res.status, field).toBe(400)
      expect(res.body.error.fields[field]).toMatch(/never take|doesn’t take|sign-in/i)
    }
    expect((await call<Connector>(t.admin, 'GET', '/connectors/azure')).body.status).toBe(
      'disconnected',
    )
  })

  it('stops at the plan’s connector limit, but lets a connected one be fixed', async () => {
    const org = getDb().orgs.find((o) => o.id === 'org_3rdloop')
    if (org) org.tier = 'pro' // 3 connectors: GitHub, Google Workspace, Hostinger
    const azure = (await call<Connector>(t.admin, 'GET', '/connectors/azure')).body
    const blocked = await call<{ error: { code: string; message: string } }>(
      t.admin,
      'PATCH',
      `/connectors/${azure.id}`,
      { ifVersion: azure.version, status: 'connected', account: 'tenant' },
    )
    expect(blocked.status).toBe(403)
    expect(blocked.body.error.code).toBe('plan_limit_reached')
    expect(blocked.body.error.message).toMatch(/3 connectors/)

    // Reconfiguring one already counted takes no new slot.
    const hostinger = (await call<Connector>(t.admin, 'GET', '/connectors/con_hostinger')).body
    const fixed = await call(t.admin, 'PATCH', '/connectors/con_hostinger', {
      ifVersion: hostinger.version,
      status: 'connected',
      account: 'ops@3rdloop.example',
    })
    expect(fixed.status).toBe(200)

    // Disconnecting frees a slot.
    const github = (await call<Connector>(t.admin, 'GET', '/connectors/con_github')).body
    await call(t.admin, 'PATCH', '/connectors/con_github', {
      ifVersion: github.version,
      status: 'disconnected',
    })
    const azure2 = (await call<Connector>(t.admin, 'GET', '/connectors/azure')).body
    const ok = await call(t.admin, 'PATCH', `/connectors/${azure2.id}`, {
      ifVersion: azure2.version,
      status: 'connected',
      account: 'tenant',
    })
    expect(ok.status).toBe(200)
  })

  it('keeps past evidence when a connector is disconnected', async () => {
    const before = getDb().evidence.length
    const github = (await call<Connector>(t.admin, 'GET', '/connectors/con_github')).body
    const res = await call<Connector>(t.admin, 'PATCH', '/connectors/con_github', {
      ifVersion: github.version,
      status: 'disconnected',
    })
    expect(res.body).toMatchObject({ status: 'disconnected', account: null })
    expect(getDb().evidence).toHaveLength(before)
  })

  it('answers a stale version with 409, and only lets editors change connectors', async () => {
    const github = (await call<Connector>(t.admin, 'GET', '/connectors/con_github')).body
    const stale = await call(t.admin, 'PATCH', '/connectors/con_github', {
      ifVersion: github.version + 5,
      status: 'disconnected',
    })
    expect(stale.status).toBe(409)
    for (const token of [t.auditor, t.approver]) {
      expect((await call(token, 'GET', '/connectors')).status).toBe(200)
      expect(
        (
          await call(token, 'PATCH', '/connectors/con_github', {
            ifVersion: 1,
            status: 'disconnected',
          })
        ).status,
      ).toBe(403)
      expect((await run('con_github', token)).status).toBe(403)
    }
    expect((await call(t.staff, 'GET', '/connectors')).status).toBe(403)
  })
})

describe('audit pack', () => {
  const pack = (token = t.admin, query = '') => call<AuditPack>(token, 'GET', `/audit-pack${query}`)

  it('walks controls to the approved policy to the evidence', async () => {
    const { status, body } = await pack(t.auditor)
    expect(status).toBe(200)
    expect(body.totals).toMatchObject({ controls: 30, passing: 25, failing: 2, no_evidence: 3 })
    const access = body.controls.find((c) => c.control.reference === 'A.5.15')
    // ITD-007 is being edited (in review) but v2 is on record, so an auditor meets v2.
    expect(access?.policies.map((p) => [p.docId, p.version])).toEqual([
      ['ITD-007', 2],
      ['ITD-006', 4],
    ])
    expect(access?.evidence).toHaveLength(1)
  })

  it('never shows a draft, or a policy nobody has approved', async () => {
    for (const token of [t.auditor, t.admin]) {
      const { body } = await pack(token)
      const sdlc = body.controls.find((c) => c.control.reference === 'A.8.25')
      // ITD-010 was never approved: the control has evidence but no policy to show.
      expect(sdlc?.policies).toEqual([])
      const docs = getDb().documents
      const shown = body.controls.flatMap((c) => c.policies.map((p) => p.docId))
      const neverApproved = docs.filter((d) => d.approvedVersion === null).map((d) => d.docId)
      expect(shown.filter((d) => neverApproved.includes(d))).toEqual([])
    }
  })

  it('judges each control from the evidence inside the period', async () => {
    const today = todayInTz('Asia/Manila', NOW)
    const future = await pack(
      t.auditor,
      `?from=${today.slice(0, 4)}-12-31&to=${today.slice(0, 4)}-12-31`,
    )
    // Nothing was collected on the last day of the year unless today is it.
    if (today !== `${today.slice(0, 4)}-12-31`) {
      expect(future.body.totals).toMatchObject({
        passing: 0,
        failing: 0,
        no_evidence: 30,
        evidence: 0,
      })
    }
    const lastWeek = await pack(t.auditor, `?from=${periodRange('90d', today).from}&to=${today}`)
    const dpa = lastWeek.body.controls.find((c) => c.control.reference === 'Sec. 20')
    // Its only evidence is 100 days old.
    expect(dpa?.periodStatus).toBe('no_evidence')
    const all = await pack(t.auditor)
    expect(all.body.controls.find((c) => c.control.reference === 'Sec. 20')?.periodStatus).toBe(
      'passing',
    )
  })

  it('filters by framework, orders by framework then reference, and checks the dates', async () => {
    const dpa = await pack(t.auditor, '?framework=DPA')
    expect(dpa.body.controls.map((c) => c.control.reference)).toEqual([
      'Sec. 16',
      'Sec. 20',
      'Sec. 21',
    ])
    expect((await pack(t.auditor, '?from=yesterday')).status).toBe(400)
    const backwards = await pack(t.auditor, '?from=2026-10-10&to=2026-01-01')
    expect(backwards.status).toBe(400)
  })

  it('exports a CSV and records the export in the audit log', async () => {
    const res = await send(t.auditor, 'GET', '/audit-pack/export?from=2020-01-01')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/csv/)
    expect(res.headers.get('content-disposition')).toMatch(
      /audit-pack-3rdloop-2020-01-01_to_today\.csv/,
    )
    const csv = await res.text()
    const [header, ...rows] = csv.split('\n')
    expect(header).toBe(
      'Framework,Control,Title,Status in period,Approved policies,Evidence date,Source,Result,Summary,File',
    )
    // A control with no evidence still gets a row, so the gap is visible.
    expect(rows.some((r) => r.includes('A.5.23') && r.includes('no evidence'))).toBe(true)
    expect(rows.some((r) => r.includes('ITD-006 v4'))).toBe(true)
    const events = await call<ListResponse<AuditEvent>>(t.admin, 'GET', '/audit-events?pageSize=3')
    expect(events.body.items[0]).toMatchObject({ action: 'audit_pack.exported' })
    expect(events.body.items[0]?.actor?.name).toBe('External Auditor')
  })

  it('is closed to staff, and needs the Evidence plan', async () => {
    expect((await pack(t.staff)).status).toBe(403)
    const clinic = await dispatchMock(
      new Request('http://mock.local/api/v1/orgs/sample-clinic/audit-pack', {
        headers: { authorization: `Bearer ${t.clinic}` },
      }),
    )
    expect(clinic.status).toBe(403)
  })

  it('shows a new upload in the pack straight away', async () => {
    const c = await byRef('A.8.15')
    await upload(t.admin, { controlId: c.id, summary: 'Log retention policy screenshot.' })
    const { body } = await pack(t.auditor)
    const logging = body.controls.find((x) => x.control.reference === 'A.8.15')
    expect(logging?.periodStatus).toBe('passing')
    expect(logging?.evidence[0]?.file?.name).toBe('restore-test.pdf')
    expect(body.totals.no_evidence).toBe(2)
  })
})

describe('the access review still feeds the control', () => {
  it('adds an item to A.5.15 when a review is signed off, and keeps it passing', async () => {
    const review = getDb().accessReviews.find((r) => r.status === 'in_progress')
    if (!review) throw new Error('No review in progress')
    for (const item of review.items) item.decision ??= 'keep'
    expect((await byRef('A.5.15')).evidenceCount).toBe(1)
    const signed = await call(t.admin, 'POST', `/access-reviews/${review.id}/sign-off`, {
      ifVersion: review.version,
    })
    expect(signed.status).toBe(200)
    const control = await byRef('A.5.15')
    expect(control.evidenceCount).toBe(2)
    expect(control.status).toBe('passing')
    const items = await call<ListResponse<EvidenceItem>>(
      t.admin,
      'GET',
      `/controls/${control.id}/evidence`,
    )
    expect(items.body.items[0]).toMatchObject({
      source: 'manual',
      originHref: expect.stringContaining('/security/access-reviews/'),
    })
  })
})
