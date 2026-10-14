import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ApiErrorBody } from '@/lib/api/types'
import { ACCESS_COOKIE } from '@/lib/auth/cookies'
import { callBackend } from '@/lib/server/backend'

export class ServerApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

async function loginRedirect(): Promise<never> {
  const path = (await headers()).get('x-loopdox-path') ?? '/'
  redirect(`/login?next=${encodeURIComponent(path)}`)
}

/**
 * GET from the backend inside a Server Component, as the signed-in user.
 * proxy.ts has already refreshed the access token if it was about to expire.
 */
export async function serverGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value
  if (!token) return loginRedirect()
  const res = await callBackend({ method: 'GET', path, token })
  if (res.status === 401) return loginRedirect()
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null
    throw new ServerApiError(
      res.status,
      body?.error.code ?? 'error',
      body?.error.message ?? res.statusText,
    )
  }
  return (await res.json()) as T
}

/** True when the request carries a session cookie (it may still be expired). */
export async function hasSessionCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(ACCESS_COOKIE)?.value)
}
