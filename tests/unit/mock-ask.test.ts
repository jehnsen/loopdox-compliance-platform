// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  AskStreamEvent,
  AskThread,
  AskThreadDetail,
  Citation,
  ListResponse,
  MeResponse,
  Questionnaire,
  QuestionnaireRowResult,
  TokenPair,
} from '@/lib/api/types'
import { readSse } from '@/lib/api/sse'
import { splitSections } from '@/lib/markdown/sections'
import { extractToc } from '@/lib/markdown/toc'
import { formatCalendarDate } from '@/lib/utils/dates'
import { dispatchMock } from '@/mocks/dispatch'
import { getDb, resetDb } from '@/mocks/store'
import { parseCsv, readXlsx, toCsv, writeXlsx } from '@/mocks/tabular'

async function login(email: string): Promise<string> {
  const res = await dispatchMock(
    new Request('http://mock.local/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'loopdox-demo' }),
    }),
  )
  return ((await res.json()) as TokenPair).accessToken
}

function req(token: string, method: string, path: string, body?: BodyInit | object) {
  const isForm = body instanceof FormData
  return dispatchMock(
    new Request(`http://mock.local/api/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body && !isForm ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    }),
  )
}

async function call<T>(token: string, method: string, path: string, body?: object | FormData) {
  const res = await req(token, method, path, body)
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T }
}

/** POST /ask and collect every SSE event. */
async function ask(
  token: string,
  org: string,
  body: object,
): Promise<{ status: number; events: AskStreamEvent[]; json?: unknown }> {
  const res = await req(token, 'POST', `/orgs/${org}/ask`, body)
  if (!res.headers.get('content-type')?.includes('text/event-stream')) {
    return { status: res.status, events: [], json: await res.json() }
  }
  const events: AskStreamEvent[] = []
  if (res.body)
    for await (const m of readSse(res.body))
      events.push({ event: m.event, data: JSON.parse(m.data) } as AskStreamEvent)
  return { status: res.status, events }
}

const textOf = (events: AskStreamEvent[]) =>
  events.flatMap((e) => (e.event === 'token' ? [e.data.text] : [])).join('')
const citationsOf = (events: AskStreamEvent[]) =>
  events.flatMap((e) => (e.event === 'citation' ? [e.data] : [])) as Citation[]
const done = (events: AskStreamEvent[]) =>
  events.find((e) => e.event === 'done')?.data as
    Extract<AskStreamEvent, { event: 'done' }>['data'] | undefined

let t: { jehnsen: string; staff: string; auditor: string; clinic: string; michael: string }

beforeEach(async () => {
  resetDb(new Date())
  t = {
    jehnsen: await login('jehnsen.enrique@3rdloop.example'),
    staff: await login('staff@3rdloop.example'),
    auditor: await login('auditor@audit-firm.example'),
    clinic: await login('frontdesk@sample-clinic.example'),
    michael: await login('michael.manabat@3rdloop.example'),
  }
})

describe('readSse', () => {
  it('parses events split across chunks, CRLF, comments and multi-line data', async () => {
    const chunks = [
      'event: tok',
      'en\r\ndata: {"text":"Hi"}\r\n\r\n: keep-alive\n\nevent: done\ndata: line1\n',
      'data: line2\n\n',
    ]
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
        c.close()
      },
    })
    const out = []
    for await (const m of readSse(body)) out.push(m)
    expect(out).toEqual([
      { event: 'token', data: '{"text":"Hi"}' },
      { event: 'done', data: 'line1\nline2' },
    ])
  })
})

describe('splitSections', () => {
  it('uses the same anchors as the table of contents', () => {
    const md =
      '## 1. Purpose\n\nWhy.\n\n## 3. Policy\n\n### 3.2 **Authentication**\n\n- MFA [[ITD-007]] everywhere.\n\n## 1. Purpose\n\nAgain.'
    const sections = splitSections(md)
    expect(sections.map((s) => s.id)).toEqual(
      extractToc(md)
        .filter((e) => e.text !== '3. Policy')
        .map((e) => e.id),
    )
    expect(sections.find((s) => s.id === '32-authentication')?.passages).toEqual([
      'MFA ITD-007 everywhere.',
    ])
  })
})

describe('Ask: streaming answers', () => {
  it('streams a cited policy answer token by token, then saves the turn', async () => {
    const { status, events } = await ask(t.staff, '3rdloop', {
      question: 'What does the Access Control Policy require for MFA?',
    })
    expect(status).toBe(200)
    expect(events[0]).toEqual({ event: 'route', data: { route: 'policy' } })
    expect(events.filter((e) => e.event === 'token').length).toBeGreaterThan(5)
    const cites = citationsOf(events)
    expect(cites[0]).toMatchObject({
      n: 1,
      kind: 'policy_section',
      docId: 'ITD-007',
      sectionId: '32-authentication',
    })
    // ITD-007 v3 is in review, so the approved v2 is quoted and linked by version.
    expect(cites[0]?.href).toBe('/3rdloop/policies/doc_itd_007/versions/2#32-authentication')
    // Each citation arrives before the first token that refers to it.
    const firstRef = events.findIndex((e) => e.event === 'token' && e.data.text.includes('[1]'))
    expect(events.findIndex((e) => e.event === 'citation')).toBeLessThan(firstRef)
    expect(textOf(events)).toContain('Multi-factor authentication is mandatory')
    const d = done(events)
    expect(d?.grounded).toBe(true)

    const thread = await call<AskThreadDetail>(
      t.staff,
      'GET',
      `/orgs/3rdloop/ask/threads/${d?.threadId}`,
    )
    expect(thread.body.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(thread.body.messages[1]?.citations).toHaveLength(cites.length)
    // Threads are private to the person who asked.
    expect((await call(t.jehnsen, 'GET', `/orgs/3rdloop/ask/threads/${d?.threadId}`)).status).toBe(
      404,
    )
  })

  it('says it couldn’t find an answer instead of guessing', async () => {
    const { events } = await ask(t.staff, '3rdloop', {
      question: 'What is the office Wi-Fi password for guests in Cebu?',
    })
    expect(citationsOf(events)).toEqual([])
    expect(textOf(events)).toBe('I couldn’t find this in your approved documents.')
    expect(done(events)).toMatchObject({ grounded: false })
    expect(done(events)?.suggestions.length).toBeGreaterThan(0)
  })

  it('continues a thread', async () => {
    const first = await ask(t.jehnsen, '3rdloop', {
      question: 'How often are backups restored as a test?',
    })
    const threadId = done(first.events)?.threadId
    await ask(t.jehnsen, '3rdloop', { question: 'And how long are backups kept?', threadId })
    const thread = await call<AskThreadDetail>(
      t.jehnsen,
      'GET',
      `/orgs/3rdloop/ask/threads/${threadId}`,
    )
    expect(thread.body.messageCount).toBe(4)
    const list = await call<ListResponse<AskThread>>(t.jehnsen, 'GET', '/orgs/3rdloop/ask/threads')
    expect(list.body.items[0]?.id).toBe(threadId)
    expect(list.body.items.map((x) => x.id)).toContain('thr_seed_1')
  })

  it('answers from the versions in force on an "as of" date', async () => {
    const db = getDb()
    // ITD-007 v1 was approved long before v2.
    const v2At =
      db.workflowEvents.find(
        (w) => w.documentId === 'doc_itd_007' && w.type === 'approve' && w.version === 2,
      )?.at ?? ''
    const before = new Date(Date.parse(v2At) - 10 * 86_400_000).toISOString().slice(0, 10)
    const { events } = await ask(t.jehnsen, '3rdloop', {
      question: 'What does the Access Control Policy say about privileged access?',
      asOf: before,
    })
    expect(citationsOf(events)[0]).toMatchObject({ docId: 'ITD-007', version: 1 })
    expect(textOf(events)).toContain(`As of ${formatCalendarDate(before)}`)
    const future = await ask(t.jehnsen, '3rdloop', { question: 'MFA?', asOf: '2999-01-01' })
    expect(future.status).toBe(400)
  })

  it('stops a stream part-way with an error event when asked to', async () => {
    const res = await req(t.staff, 'POST', '/orgs/3rdloop/ask?simulate=stream_error', {
      question: 'What does the Access Control Policy require for MFA?',
    })
    const events: string[] = []
    if (res.body) for await (const m of readSse(res.body)) events.push(m.event)
    expect(events).toContain('token')
    expect(events.at(-1)).toBe('error')
    expect(events).not.toContain('done')
  })
})

describe('Ask: routes, plans and roles', () => {
  it('answers register questions from the records the caller can see', async () => {
    const { events } = await ask(t.jehnsen, '3rdloop', {
      question: 'Which systems hold personal data?',
    })
    expect(events[0]).toEqual({ event: 'route', data: { route: 'records' } })
    expect(citationsOf(events).length).toBeGreaterThan(0)
    expect(
      citationsOf(events).every((c) => c.kind === 'record' && c.href.includes('/security/assets/')),
    ).toBe(true)
  })

  it('traces impact through linked records', async () => {
    const { events } = await ask(t.jehnsen, '3rdloop', {
      question: 'What is affected if we change ITD-007?',
      route: 'impact',
    })
    expect(events[0]).toEqual({ event: 'route', data: { route: 'impact' } })
    const cites = citationsOf(events)
    expect(cites[0]?.label).toContain('ITD-007')
    expect(cites.length).toBeGreaterThan(1)
  })

  it('keeps Records and Impact to Pro and above', async () => {
    const res = await ask(t.clinic, 'sample-clinic', {
      question: 'Which systems hold personal data?',
      route: 'records',
    })
    expect(res.status).toBe(403)
    expect(res.json).toMatchObject({ error: { code: 'feature_not_in_plan' } })
    // Automatic routing on Starter stays on policies.
    const auto = await ask(t.clinic, 'sample-clinic', {
      question: 'Which systems hold personal data?',
    })
    expect(auto.events[0]).toEqual({ event: 'route', data: { route: 'policy' } })
  })

  it('limits auditors to approved policies and evidence', async () => {
    const impact = await ask(t.auditor, '3rdloop', {
      question: 'What does ITD-007 affect?',
      route: 'impact',
    })
    expect(impact.status).toBe(403)
    const records = await ask(t.auditor, '3rdloop', {
      question: 'List failing controls',
      route: 'records',
    })
    expect(
      citationsOf(records.events).every(
        (c) => c.kind === 'evidence' || c.href.includes('/evidence/'),
      ),
    ).toBe(true)
  })

  it('counts questions and stops Starter at the monthly cap', async () => {
    const before = (await call<MeResponse>(t.clinic, 'GET', '/me?org=sample-clinic')).body.usage
      ?.askQuestions
    expect(before).toMatchObject({ used: 38, limit: 100 })
    const res = await ask(t.clinic, 'sample-clinic', { question: 'Who can see patient records?' })
    expect(done(res.events)?.usage).toMatchObject({ used: 39, limit: 100 })
    const row = getDb().usage.find((u) => u.orgId === 'org_sample_clinic')
    if (row) row.askQuestions = 100
    const capped = await ask(t.clinic, 'sample-clinic', {
      question: 'Who can see patient records?',
    })
    expect(capped.status).toBe(403)
    expect(capped.json).toMatchObject({ error: { code: 'plan_limit_reached' } })
  })

  it('records feedback on the asker’s own answers only', async () => {
    const msg = 'msg_seed_4'
    const res = await call<{ feedback: { rating: string; note: string } }>(
      t.jehnsen,
      'POST',
      `/orgs/3rdloop/ask/messages/${msg}/feedback`,
      {
        rating: 'down',
        note: 'Should mention the 24-hour client notice.',
      },
    )
    expect(res.body.feedback).toMatchObject({
      rating: 'down',
      note: 'Should mention the 24-hour client notice.',
    })
    expect(
      (await call(t.staff, 'POST', `/orgs/3rdloop/ask/messages/${msg}/feedback`, { rating: 'up' }))
        .status,
    ).toBe(404)
  })
})

describe('tabular', () => {
  it('round-trips CSV with quotes, commas and newlines', () => {
    const rows = [
      ['Q', 'A'],
      ['Say "hi", please', 'Line 1\nLine 2'],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
  it('round-trips XLSX', () => {
    const rows = [
      ['#', 'Question'],
      ['1', 'Do you encrypt data & <keys>?'],
    ]
    expect(readXlsx(writeXlsx(rows, 'Vendor')).rows).toEqual(rows)
    expect(readXlsx(writeXlsx(rows, 'Vendor')).sheetName).toBe('Vendor')
  })
})

describe('Questionnaires', () => {
  const csv = toCsv([
    ['No.', 'Requirement', 'Supplier response'],
    ['1', 'Is multi-factor authentication required for all accounts?', ''],
    ['2', 'Are production databases backed up daily?', ''],
    ['3', 'What is your favourite colour?', 'Blue'],
  ])

  function form(name: string, content: BlobPart, type: string) {
    const f = new FormData()
    f.append('name', 'Annual vendor review')
    f.append('client', 'Example Client Inc.')
    f.append('file', new File([content], name, { type }))
    return f
  }

  it('uploads, suggests a mapping, drafts cited answers, reviews and exports CSV', async () => {
    const up = await call<Questionnaire>(
      t.jehnsen,
      'POST',
      '/orgs/3rdloop/questionnaires',
      form('vendor.csv', csv, 'text/csv'),
    )
    expect(up.status).toBe(201)
    expect(up.body).toMatchObject({
      status: 'mapping',
      format: 'csv',
      columns: ['No.', 'Requirement', 'Supplier response'],
    })
    expect(up.body.suggestedMapping).toEqual({ questionColumn: 1, answerColumn: 2 })

    const mapped = await call<Questionnaire>(
      t.jehnsen,
      'POST',
      `/orgs/3rdloop/questionnaires/${up.body.id}/mapping`,
      {
        ifVersion: up.body.version,
        questionColumn: 1,
        answerColumn: 2,
      },
    )
    expect(mapped.body.status).toBe('in_review')
    const [mfa, backup, colour] = mapped.body.rows
    expect(mfa).toMatchObject({ status: 'draft' })
    expect(mfa?.citations[0]?.kind).toBe('policy_section')
    expect(backup?.draftAnswer).toContain('backed up daily')
    expect(colour).toMatchObject({ status: 'needs_input', draftAnswer: '' })

    // Approving needs text; editing marks the row edited.
    expect(
      (
        await call(
          t.jehnsen,
          'PATCH',
          `/orgs/3rdloop/questionnaires/${up.body.id}/rows/${colour?.id}`,
          { ifVersion: 1, status: 'approved' },
        )
      ).status,
    ).toBe(422)
    const edited = await call<QuestionnaireRowResult>(
      t.jehnsen,
      'PATCH',
      `/orgs/3rdloop/questionnaires/${up.body.id}/rows/${colour?.id}`,
      {
        ifVersion: 1,
        draftAnswer: 'Not applicable to this engagement.',
      },
    )
    expect(edited.body).toMatchObject({
      status: 'edited',
      version: 2,
      editorName: 'Jehnsen Enrique',
    })
    expect(
      (
        await call(
          t.jehnsen,
          'PATCH',
          `/orgs/3rdloop/questionnaires/${up.body.id}/rows/${colour?.id}`,
          { ifVersion: 1, status: 'approved' },
        )
      ).status,
    ).toBe(409)
    for (const row of mapped.body.rows) {
      const version = row.id === colour?.id ? 2 : 1
      await call(t.jehnsen, 'PATCH', `/orgs/3rdloop/questionnaires/${up.body.id}/rows/${row.id}`, {
        ifVersion: version,
        status: 'approved',
      })
    }
    const complete = await call<Questionnaire>(
      t.jehnsen,
      'GET',
      `/orgs/3rdloop/questionnaires/${up.body.id}`,
    )
    expect(complete.body.status).toBe('complete')
    expect(complete.body.progress).toMatchObject({ total: 3, approved: 3 })

    const file = await req(t.michael, 'POST', `/orgs/3rdloop/questionnaires/${up.body.id}/export`)
    expect(file.headers.get('content-type')).toContain('text/csv')
    expect(file.headers.get('content-disposition')).toContain('vendor (answered).csv')
    const out = parseCsv(await file.text())
    expect(out[0]).toEqual(['No.', 'Requirement', 'Supplier response'])
    expect(out[3]?.[2]).toBe('Not applicable to this engagement.')
    expect(out[1]?.[2]).not.toMatch(/\[\d\]/)
  })

  it('reads and writes Excel workbooks in their original format', async () => {
    const xlsx = writeXlsx(
      [
        ['Question', 'Answer'],
        ['Do subcontractors sign data processing agreements?', ''],
      ],
      'Security',
    )
    const up = await call<Questionnaire>(
      t.jehnsen,
      'POST',
      '/orgs/3rdloop/questionnaires',
      form(
        'client.xlsx',
        new Uint8Array(xlsx),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    )
    expect(up.body.format).toBe('xlsx')
    await call(t.jehnsen, 'POST', `/orgs/3rdloop/questionnaires/${up.body.id}/mapping`, {
      ifVersion: 1,
      questionColumn: 0,
      answerColumn: 1,
    })
    const res = await req(t.jehnsen, 'POST', `/orgs/3rdloop/questionnaires/${up.body.id}/export`)
    const back = readXlsx(Buffer.from(await res.arrayBuffer()))
    expect(back.sheetName).toBe('Security')
    expect(back.rows[1]?.[1]).toContain('data processing')
  })

  it('rejects unsupported files and keeps Starter and staff out', async () => {
    const bad = await call<{ error: { fields: Record<string, string> } }>(
      t.jehnsen,
      'POST',
      '/orgs/3rdloop/questionnaires',
      form('notes.pdf', 'x', 'application/pdf'),
    )
    expect(bad.status).toBe(400)
    expect(bad.body.error.fields.file).toContain('isn’t a CSV or Excel')
    expect((await call(t.staff, 'GET', '/orgs/3rdloop/questionnaires')).status).toBe(403)
    expect(
      (
        await call(
          t.michael,
          'POST',
          '/orgs/3rdloop/questionnaires',
          form('v.csv', csv, 'text/csv'),
        )
      ).status,
    ).toBe(403)
  })

  it('seeds a questionnaire half-way through review', async () => {
    const q = await call<Questionnaire>(t.jehnsen, 'GET', '/orgs/3rdloop/questionnaires/qnr_seed_1')
    expect(q.body.progress).toMatchObject({ total: 12, approved: 4, edited: 2, needsInput: 2 })
  })
})

describe('suggestMapping', () => {
  it('prefers a Question column over weaker names, and finds the answer column', async () => {
    const { suggestMapping } = await import('@/mocks/handlers/questionnaires')
    expect(suggestMapping(['Ref', 'Control area', 'Question', 'Your response'], [])).toEqual({
      questionColumn: 2,
      answerColumn: 3,
    })
    expect(suggestMapping(['ID', 'Requirement', 'Notes'], [])).toEqual({
      questionColumn: 1,
      answerColumn: null,
    })
    // No telling names: the column with the most text holds the questions.
    expect(
      suggestMapping(
        ['A', 'B'],
        [
          ['1', 'Do you encrypt backups?'],
          ['2', 'Is MFA enforced for admins?'],
        ],
      ),
    ).toEqual({
      questionColumn: 1,
      answerColumn: null,
    })
  })
})
