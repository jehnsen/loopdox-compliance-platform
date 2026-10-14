import type { z } from 'zod'
import type { ApiErrorBody, ApiErrorCode, ListResponse } from '@/lib/api/types'

export function json<T>(data: T, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>,
  headers?: HeadersInit,
): Response {
  const body: ApiErrorBody = { error: { code, message, ...(fields ? { fields } : {}) } }
  return Response.json(body, { status, headers })
}

/** Thrown inside handlers to short-circuit with an error response. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message)
  }
}

export const notFound = (what = 'Record') => new HttpError(404, 'not_found', `${what} not found.`)
export const forbidden = (message = 'Your role doesn’t allow this action.') =>
  new HttpError(403, 'forbidden', message)

export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] ??= issue.message
  }
  return fields
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new HttpError(
      400,
      'validation_error',
      'Some fields need attention.',
      zodFields(result.error),
    )
  }
  return result.data
}

/** Optimistic concurrency: `ifVersion` must match the stored version. */
export function checkVersion(current: { version: number }, ifVersion: number | undefined): void {
  if (ifVersion === undefined) {
    throw new HttpError(400, 'validation_error', 'ifVersion is required.', {
      ifVersion: 'Required',
    })
  }
  if (ifVersion !== current.version) {
    throw new HttpError(
      409,
      'version_conflict',
      `This record changed since you opened it (you had v${ifVersion}, it is now v${current.version}).`,
    )
  }
}

export interface ListOptions<T> {
  /** Fields searched by `q` (case-insensitive substring). */
  search?: (item: T) => (string | null | undefined)[]
  /** Per-field filters: query param name → predicate. Values may be comma-separated. */
  filters?: Record<string, (item: T, values: string[]) => boolean>
  defaultSort?: string
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' })
}

/** Applies q, filters, sort and pagination exactly as the backend will. */
export function paginate<T extends object>(
  all: readonly T[],
  query: URLSearchParams,
  opts: ListOptions<T> = {},
): ListResponse<T> {
  let items = [...all]
  const q = query.get('q')?.trim().toLowerCase()
  const search = opts.search
  if (q && search) {
    items = items.filter((it) => search(it).some((v) => v?.toLowerCase().includes(q)))
  }
  for (const [name, predicate] of Object.entries(opts.filters ?? {})) {
    const raw = query
      .getAll(name)
      .flatMap((v) => v.split(','))
      .filter(Boolean)
    if (raw.length) items = items.filter((it) => predicate(it, raw))
  }
  const sort = query.get('sort') ?? opts.defaultSort
  if (sort) {
    const desc = sort.startsWith('-')
    const key = desc ? sort.slice(1) : sort
    items.sort((a, b) => {
      const r = compare((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      return desc ? -r : r
    })
  }
  const pageSize = Math.min(Math.max(Number(query.get('pageSize')) || 25, 1), 200)
  const page = Math.max(Number(query.get('page')) || 1, 1)
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: items.length,
  }
}
