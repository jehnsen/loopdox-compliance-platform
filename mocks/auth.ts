import { jwtVerify, SignJWT } from 'jose'
import type { TokenPair } from '@/lib/api/types'

/**
 * Mock token issuer. Stands in for FastAPI's JWT auth so the BFF code path is the
 * same in mock and live mode. Stateless: no store access, so proxy.ts can use it.
 */

export const MOCK_ACCESS_TTL_SECONDS = 15 * 60
export const MOCK_REFRESH_TTL_SECONDS = 12 * 60 * 60

const ISSUER = 'loopdox-mock'

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.MOCK_JWT_SECRET ?? 'dev-only-mock-secret-not-for-production-use',
  )
}

async function sign(userId: string, typ: 'access' | 'refresh', ttl: number): Promise<string> {
  return new SignJWT({ typ })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${ttl}s`)
    .sign(secret())
}

export async function issueMockTokens(userId: string): Promise<TokenPair> {
  return {
    accessToken: await sign(userId, 'access', MOCK_ACCESS_TTL_SECONDS),
    refreshToken: await sign(userId, 'refresh', MOCK_REFRESH_TTL_SECONDS),
    expiresIn: MOCK_ACCESS_TTL_SECONDS,
    refreshExpiresIn: MOCK_REFRESH_TTL_SECONDS,
  }
}

/** Returns the user ID for a valid token of the given type, else null. */
export async function verifyMockToken(
  token: string,
  typ: 'access' | 'refresh',
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER })
    if (payload.typ !== typ || typeof payload.sub !== 'string') return null
    return payload.sub
  } catch {
    return null
  }
}

export async function refreshMockTokens(refreshToken: string): Promise<TokenPair | null> {
  const userId = await verifyMockToken(refreshToken, 'refresh')
  return userId ? issueMockTokens(userId) : null
}
