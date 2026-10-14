import type { ApiErrorBody, ApiErrorCode, ListQuery } from '@/lib/api/types'

/**
 * Typed client for the BFF at /api/v1 (same origin). Tokens are attached server-side;
 * this code never sees them.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
    public fields?: Record<string, string>,
    /** Seconds to wait before retrying (429). */
    public retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isConflict() {
    return this.status === 409
  }
  get isForbidden() {
    return this.status === 403
  }
  get isNotFound() {
    return this.status === 404
  }
  get isValidation() {
    return this.status === 400 && Boolean(this.fields)
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

type QueryValue = ListQuery[string]

export function toQueryString(query?: Record<string, QueryValue>): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '' || value === null) continue
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','))
    } else params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

const FRIENDLY: Partial<Record<number, string>> = {
  401: 'Your session has ended. Sign in again.',
  403: 'Your role doesn’t allow this action.',
  404: 'We couldn’t find that record. It may have been deleted.',
  429: 'Too many requests. Wait a moment and try again.',
  500: 'The server hit an error. Try again in a moment.',
}

export async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null
  const retry = Number(res.headers.get('retry-after'))
  return new ApiError(
    res.status,
    body?.error.code ?? 'internal_error',
    body?.error.message ?? FRIENDLY[res.status] ?? `Request failed (${res.status}).`,
    body?.error.fields,
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  )
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return
  const next = window.location.pathname + window.location.search
  // A full navigation is intended: the session is over, so drop all client state.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`)
}

export interface RequestOptions {
  query?: Record<string, QueryValue>
  body?: unknown
  signal?: AbortSignal
  headers?: HeadersInit
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers = new Headers(opts.headers)
  let body: BodyInit | undefined
  if (opts.body instanceof FormData) body = opts.body
  else if (opts.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(opts.body)
  }
  const res = await fetch(`/api/v1${path}${toQueryString(opts.query)}`, {
    method,
    headers,
    body,
    signal: opts.signal,
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (res.status === 401) {
    redirectToLogin()
    throw await toApiError(res)
  }
  if (!res.ok) throw await toApiError(res)
  if (res.status === 204 || res.status === 202) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('POST', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PATCH', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PUT', path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
}

/**
 * Downloads a file the backend generates (exports). The BFF passes the
 * Content-Disposition filename through.
 */
export async function downloadFile(
  path: string,
  query?: Record<string, QueryValue>,
): Promise<void> {
  const res = await fetch(`/api/v1${path}${toQueryString(query)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!res.ok) throw await toApiError(res)
  const disposition = res.headers.get('content-disposition') ?? ''
  const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? 'export'
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "/orgs/3rdloop/members" */
export function orgPath(org: string, path = ''): string {
  return `/orgs/${encodeURIComponent(org)}${path}`
}

/** Calls the BFF auth endpoints (/api/auth/*), which set or clear the session cookies. */
export async function authRequest<T = void>(
  action: string,
  body?: unknown,
  method: 'GET' | 'POST' = 'POST',
): Promise<T> {
  const res = await fetch(`/api/auth/${action}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!res.ok) throw await toApiError(res)
  if (res.status === 204 || res.status === 202) return undefined as T
  return (await res.json()) as T
}
