import 'server-only'
import { serverEnv } from '@/lib/env'

export interface BackendRequest {
  method: string
  /** Path under /api/v1, including any query string: "/orgs/3rdloop/members?page=2". */
  path: string
  token?: string | null
  headers?: HeadersInit
  body?: BodyInit | null
}

/**
 * Calls the backend: the in-process mock API (API_MODE=mock) or FastAPI (API_MODE=live).
 * The only place that knows which one is in use.
 */
export async function callBackend({
  method,
  path,
  token,
  headers,
  body,
}: BackendRequest): Promise<Response> {
  const h = new Headers(headers)
  if (token) h.set('authorization', `Bearer ${token}`)
  h.set('accept', h.get('accept') ?? 'application/json')

  if (serverEnv.apiMode === 'mock') {
    const { dispatchMock } = await import('@/mocks/dispatch')
    return dispatchMock(
      new Request(`http://mock.local/api/v1${path}`, {
        method,
        headers: h,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
      }),
    )
  }

  return fetch(`${serverEnv.apiBaseUrl}${path}`, {
    method,
    headers: h,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
    cache: 'no-store',
    redirect: 'manual',
  })
}
