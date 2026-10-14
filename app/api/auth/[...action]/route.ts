import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { ApiErrorBody, TokenPair } from '@/lib/api/types'
import {
  ACCESS_COOKIE,
  applyCookies,
  clearedSessionCookies,
  sessionCookies,
} from '@/lib/auth/cookies'
import { serverEnv } from '@/lib/env'
import { callBackend } from '@/lib/server/backend'
import { isSameOrigin } from '@/lib/server/origin'

export const dynamic = 'force-dynamic'

/**
 * BFF auth endpoints. They exchange credentials with the backend and keep the
 * resulting tokens in httpOnly cookies; responses to the browser never contain tokens.
 *
 *   POST /api/auth/login                    { email, password }
 *   POST /api/auth/mock-login               { email }            (mock mode only)
 *   POST /api/auth/logout
 *   POST /api/auth/forgot-password          { email }
 *   POST /api/auth/reset-password           { token, password, confirm }
 *   GET  /api/auth/invites/:token
 *   POST /api/auth/invites/:token/accept    { name, password, confirm }
 */

function error(status: number, code: string, message: string) {
  const body: ApiErrorBody = { error: { code, message } }
  return NextResponse.json(body, { status })
}

async function passthrough(upstream: Response): Promise<NextResponse> {
  const text = await upstream.text()
  return new NextResponse(text || null, {
    status: upstream.status,
    headers: text ? { 'content-type': 'application/json' } : undefined,
  })
}

/** Forwards to an endpoint that returns a token pair, and turns the pair into cookies. */
async function exchange(path: string, body: string): Promise<NextResponse> {
  const upstream = await callBackend({
    method: 'POST',
    path,
    headers: { 'content-type': 'application/json' },
    body,
  })
  if (!upstream.ok) return passthrough(upstream)
  const pair = (await upstream.json()) as TokenPair
  const res = new NextResponse(null, { status: 204 })
  applyCookies(res.cookies, sessionCookies(pair))
  return res
}

type Ctx = { params: Promise<{ action: string[] }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!isSameOrigin(req)) return error(403, 'forbidden', 'Cross-site requests aren’t allowed.')
  const action = (await params).action.join('/')
  const body = await req.text()

  if (action === 'login') return exchange('/auth/login', body)

  if (action === 'mock-login') {
    if (serverEnv.apiMode !== 'mock') return error(404, 'not_found', 'Not available.')
    return exchange('/auth/mock-login', body)
  }

  if (action === 'logout') {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value
    if (token) await callBackend({ method: 'POST', path: '/auth/logout', token }).catch(() => null)
    const res = new NextResponse(null, { status: 204 })
    applyCookies(res.cookies, clearedSessionCookies())
    return res
  }

  if (action === 'forgot-password' || action === 'reset-password') {
    return passthrough(
      await callBackend({
        method: 'POST',
        path: `/auth/${action}`,
        headers: { 'content-type': 'application/json' },
        body,
      }),
    )
  }

  const accept = /^invites\/([^/]+)\/accept$/.exec(action)
  if (accept?.[1]) return exchange(`/auth/invites/${encodeURIComponent(accept[1])}/accept`, body)

  return error(404, 'not_found', 'Unknown auth action.')
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const action = (await params).action
  if (action[0] === 'invites' && action[1] && action.length === 2) {
    return passthrough(
      await callBackend({ method: 'GET', path: `/auth/invites/${encodeURIComponent(action[1])}` }),
    )
  }
  return error(404, 'not_found', 'Unknown auth action.')
}
