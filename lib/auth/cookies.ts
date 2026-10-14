import type { TokenPair } from '@/lib/api/types'
import { serverEnv } from '@/lib/env'

/**
 * Session cookies (BFF pattern). Tokens live only in httpOnly cookies; browser
 * JavaScript never sees them.
 */
export const ACCESS_COOKIE = serverEnv.sessionCookie
export const REFRESH_COOKIE = `${serverEnv.sessionCookie}_refresh`

/** Refresh this many seconds before the access token actually expires. */
const EARLY_REFRESH_SECONDS = 30

export interface CookieSpec {
  name: string
  value: string
  options: {
    httpOnly: true
    secure: boolean
    sameSite: 'lax'
    path: '/'
    maxAge: number
  }
}

function options(maxAge: number): CookieSpec['options'] {
  return {
    httpOnly: true,
    // Browsers treat http://localhost as secure, but dev servers on LAN IPs are not.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  }
}

/** The access cookie expires with the token, so a missing access cookie means "refresh now". */
export function sessionCookies(pair: TokenPair): CookieSpec[] {
  return [
    {
      name: ACCESS_COOKIE,
      value: pair.accessToken,
      options: options(Math.max(1, pair.expiresIn - EARLY_REFRESH_SECONDS)),
    },
    { name: REFRESH_COOKIE, value: pair.refreshToken, options: options(pair.refreshExpiresIn) },
  ]
}

export function clearedSessionCookies(): CookieSpec[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) => ({ name, value: '', options: options(0) }))
}

interface CookieWriter {
  set(name: string, value: string, options: CookieSpec['options']): unknown
}

export function applyCookies(target: CookieWriter, specs: CookieSpec[]): void {
  for (const c of specs) target.set(c.name, c.value, c.options)
}
