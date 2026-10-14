/**
 * Server environment. Safe to import from proxy.ts (no `server-only`), but never
 * from client components: none of these are NEXT_PUBLIC_.
 */
export const serverEnv = {
  apiMode: (process.env.API_MODE === 'live' ? 'live' : 'mock') as 'mock' | 'live',
  apiBaseUrl: (process.env.API_BASE_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, ''),
  sessionCookie: process.env.SESSION_COOKIE_NAME ?? 'loopdox_session',
}
