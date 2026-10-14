// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type { ListResponse, MeResponse, Member, NotificationList, TokenPair } from '@/lib/api/types'
import { dispatchMock } from '@/mocks/dispatch'
import { resetDb } from '@/mocks/store'
import { paginate } from '@/mocks/http'

async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await dispatchMock(
    new Request(`http://mock.local/api/v1${path}`, {
      method,
      headers: {
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }),
  )
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null }
}

async function login(email: string): Promise<string> {
  const { status, body } = await call('POST', '/auth/login', {
    body: { email, password: 'loopdox-demo' },
  })
  expect(status).toBe(200)
  return (body as TokenPair).accessToken
}

beforeEach(() => {
  resetDb(new Date('2026-10-14T04:00:00Z'))
})

describe('mock API: auth', () => {
  it('rejects bad credentials with the error envelope', async () => {
    const { status, body } = await call('POST', '/auth/login', {
      body: { email: 'staff@3rdloop.example', password: 'wrong' },
    })
    expect(status).toBe(401)
    expect(body).toMatchObject({ error: { code: 'invalid_credentials' } })
  })

  it('maps zod validation failures onto fields', async () => {
    const { status, body } = await call('POST', '/auth/login', { body: { email: 'not-an-email' } })
    expect(status).toBe(400)
    expect(body).toMatchObject({
      error: {
        code: 'validation_error',
        fields: { email: expect.any(String), password: expect.any(String) },
      },
    })
  })

  it('requires a token for user routes', async () => {
    expect((await call('GET', '/me')).status).toBe(401)
  })

  it('refreshes with a refresh token but not with an access token', async () => {
    const { body } = await call('POST', '/auth/login', {
      body: { email: 'staff@3rdloop.example', password: 'loopdox-demo' },
    })
    const pair = body as TokenPair
    expect(
      (await call('POST', '/auth/refresh', { body: { refreshToken: pair.refreshToken } })).status,
    ).toBe(200)
    expect(
      (await call('POST', '/auth/refresh', { body: { refreshToken: pair.accessToken } })).status,
    ).toBe(401)
  })
})

describe('mock API: /me', () => {
  it('returns memberships, roles, permissions and Starter usage', async () => {
    const token = await login('jehnsen.enrique@3rdloop.example')
    const { body } = await call('GET', '/me?org=sample-clinic', { token })
    const me = body as MeResponse
    expect(me.memberships.map((m) => m.org.slug)).toEqual(['3rdloop', 'sample-clinic'])
    expect(me.org?.slug).toBe('sample-clinic')
    expect(me.tier).toBe('starter')
    expect(me.roles).toEqual(['admin'])
    expect(me.usage?.askQuestions).toMatchObject({ used: 38, limit: 100 })
  })

  it('resolves the single org automatically', async () => {
    const token = await login('staff@3rdloop.example')
    const me = (await call('GET', '/me', { token })).body as MeResponse
    expect(me.org?.slug).toBe('3rdloop')
    expect(me.permissions).toContain('incidents.report')
    expect(me.permissions).not.toContain('privacy.read')
  })
})

describe('mock API: tenancy and permissions', () => {
  it('returns 404 for orgs the user is not a member of', async () => {
    const token = await login('staff@3rdloop.example')
    expect((await call('GET', '/orgs/sample-clinic', { token })).status).toBe(404)
  })

  it('forbids the org-wide audit log to staff', async () => {
    const token = await login('staff@3rdloop.example')
    const { status, body } = await call('GET', '/orgs/3rdloop/audit-events', { token })
    expect(status).toBe(403)
    expect(body).toMatchObject({ error: { code: 'forbidden' } })
  })

  it('lists members with search and pagination', async () => {
    const token = await login('jehnsen.enrique@3rdloop.example')
    const { body } = await call('GET', '/orgs/3rdloop/members?q=michael', { token })
    const list = body as ListResponse<Member>
    expect(list.total).toBe(1)
    expect(list.items[0]).toMatchObject({ name: 'Michael Manabat', roles: ['approver'] })
  })

  it('marks notifications read', async () => {
    const token = await login('jehnsen.enrique@3rdloop.example')
    const before = (await call('GET', '/orgs/3rdloop/notifications', { token }))
      .body as NotificationList
    expect(before.unread).toBe(2)
    expect(
      (await call('POST', '/orgs/3rdloop/notifications/read', { token, body: { all: true } }))
        .status,
    ).toBe(204)
    const after = (await call('GET', '/orgs/3rdloop/notifications', { token }))
      .body as NotificationList
    expect(after.unread).toBe(0)
  })

  it('supports ?simulate=error and unknown routes', async () => {
    const token = await login('staff@3rdloop.example')
    expect((await call('GET', '/me?simulate=error', { token })).status).toBe(500)
    expect((await call('GET', '/nope', { token })).status).toBe(404)
    expect((await call('DELETE', '/me', { token })).status).toBe(405)
  })
})

describe('paginate', () => {
  const rows = [
    { id: 'a', n: 3, name: 'Charlie' },
    { id: 'b', n: 1, name: 'alpha' },
    { id: 'c', n: 2, name: 'Bravo' },
  ]
  it('sorts, filters and pages', () => {
    const q = new URLSearchParams('sort=-n&pageSize=2&page=1')
    expect(paginate(rows, q).items.map((r) => r.id)).toEqual(['a', 'c'])
    expect(paginate(rows, new URLSearchParams('sort=name')).items.map((r) => r.id)).toEqual([
      'b',
      'c',
      'a',
    ])
    const filtered = paginate(rows, new URLSearchParams('id=a,b'), {
      filters: { id: (r, v) => v.includes(r.id) },
    })
    expect(filtered.total).toBe(2)
  })
})
