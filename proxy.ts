import { NextResponse, type NextRequest } from 'next/server'
import {
  ACCESS_COOKIE,
  applyCookies,
  clearedSessionCookies,
  REFRESH_COOKIE,
  sessionCookies,
  type CookieSpec,
} from '@/lib/auth/cookies'
import { refreshTokens } from '@/lib/auth/refresh'

/** Pages reachable without a session. */
const PUBLIC_PATHS = [
  /^\/$/,
  /^\/login$/,
  /^\/forgot-password$/,
  /^\/reset-password$/,
  /^\/accept-invite\//,
]

function contentSecurityPolicy(nonce: string, https: boolean): string {
  const dev = process.env.NODE_ENV === 'development'
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? ` 'unsafe-eval'` : ''}`,
    // Inline style attributes are needed by Radix positioning; scripts stay nonce-only.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}

/**
 * Runs before every page render:
 * 1. Sets a strict, nonce-based Content-Security-Policy.
 * 2. Redirects signed-out users to /login?next=….
 * 3. Refreshes an expired access token so Server Components always have a valid one.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const nonce = btoa(crypto.randomUUID())
  const csp = contentSecurityPolicy(nonce, request.nextUrl.protocol === 'https:')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)
  requestHeaders.set('x-loopdox-path', `${pathname}${search}`)

  let issued: CookieSpec[] | null = null

  if (!PUBLIC_PATHS.some((re) => re.test(pathname))) {
    const access = request.cookies.get(ACCESS_COOKIE)?.value
    if (!access) {
      const refresh = request.cookies.get(REFRESH_COOKIE)?.value
      const pair = refresh ? await refreshTokens(refresh) : null
      if (!pair) {
        const login = new URL('/login', request.url)
        login.searchParams.set('next', `${pathname}${search}`)
        const res = NextResponse.redirect(login)
        if (refresh) applyCookies(res.cookies, clearedSessionCookies())
        return res
      }
      issued = sessionCookies(pair)
      // Make the new tokens visible to this render, not just to the next request.
      for (const c of issued) request.cookies.set(c.name, c.value)
      requestHeaders.set('cookie', request.cookies.toString())
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('content-security-policy', csp)
  if (issued) applyCookies(res.cookies, issued)
  return res
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals and files with an extension.
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)',
  ],
}
