import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { ApiErrorBody } from '@/lib/api/types'
import {
  ACCESS_COOKIE,
  applyCookies,
  clearedSessionCookies,
  REFRESH_COOKIE,
  sessionCookies,
  type CookieSpec,
} from '@/lib/auth/cookies'
import { refreshTokens } from '@/lib/auth/refresh'
import { callBackend } from '@/lib/server/backend'
import { isSameOrigin } from '@/lib/server/origin'

export const dynamic = 'force-dynamic'

/** Request headers forwarded to the backend. Cookies are never forwarded. */
const FORWARD_REQUEST = ['content-type', 'accept', 'if-match', 'x-request-id', 'last-event-id']
/** Response headers passed back to the browser. */
const FORWARD_RESPONSE = [
  'content-type',
  'content-disposition',
  'cache-control',
  'retry-after',
  'etag',
  'allow',
  'x-request-id',
  'x-content-type-options',
]

function errorResponse(status: number, code: string, message: string): NextResponse {
  const body: ApiErrorBody = { error: { code, message } }
  return NextResponse.json(body, { status })
}

/**
 * BFF proxy for /api/v1/*. Attaches the access token from the httpOnly cookie,
 * refreshes it transparently, and streams the backend response through.
 */
async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isSameOrigin(req)) {
    return errorResponse(403, 'forbidden', 'Cross-site requests aren’t allowed.')
  }
  const { path } = await params
  const target = `/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`

  const jar = await cookies()
  let access = jar.get(ACCESS_COOKIE)?.value
  const refresh = jar.get(REFRESH_COOKIE)?.value
  let issued: CookieSpec[] | null = null

  if (!access && refresh) {
    const pair = await refreshTokens(refresh)
    if (pair) {
      access = pair.accessToken
      issued = sessionCookies(pair)
    }
  }
  if (!access) {
    const res = errorResponse(401, 'unauthenticated', 'Your session has ended. Sign in again.')
    applyCookies(res.cookies, clearedSessionCookies())
    return res
  }

  const headers = new Headers()
  for (const name of FORWARD_REQUEST) {
    const v = req.headers.get(name)
    if (v) headers.set(name, v)
  }
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor)

  const method = req.method.toUpperCase()
  const body = method === 'GET' || method === 'HEAD' ? null : await req.arrayBuffer()

  let upstream = await callBackend({ method, path: target, token: access, headers, body })

  // The access token can expire between the cookie check and the backend: refresh once and retry.
  if (upstream.status === 401 && refresh && !issued) {
    const pair = await refreshTokens(refresh)
    if (pair) {
      issued = sessionCookies(pair)
      upstream = await callBackend({ method, path: target, token: pair.accessToken, headers, body })
    }
  }

  const outHeaders = new Headers()
  for (const name of FORWARD_RESPONSE) {
    const v = upstream.headers.get(name)
    if (v) outHeaders.set(name, v)
  }
  if (upstream.headers.get('content-type')?.startsWith('text/event-stream')) {
    outHeaders.set('cache-control', 'no-cache, no-transform')
    outHeaders.set('x-accel-buffering', 'no')
  }

  const res = new NextResponse(upstream.body, { status: upstream.status, headers: outHeaders })
  if (upstream.status === 401) applyCookies(res.cookies, clearedSessionCookies())
  else if (issued) applyCookies(res.cookies, issued)
  return res
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE }
