import type { TokenPair } from '@/lib/api/types'
import { serverEnv } from '@/lib/env'

/**
 * Exchanges a refresh token for a new token pair. Used by proxy.ts and the
 * /api/v1 route handler. Returns null when the refresh token is no longer valid.
 */
export async function refreshTokens(refreshToken: string): Promise<TokenPair | null> {
  if (serverEnv.apiMode === 'mock') {
    // Stateless JWT check; does not touch the mock store, so it is safe in proxy.ts.
    const { refreshMockTokens } = await import('@/mocks/auth')
    return refreshMockTokens(refreshToken)
  }
  try {
    const res = await fetch(`${serverEnv.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    })
    return res.ok ? ((await res.json()) as TokenPair) : null
  } catch {
    return null
  }
}
