import { verifyMockToken } from '@/mocks/auth'
import { agreementRoutes } from '@/mocks/handlers/agreements'
import { auditEventRoutes } from '@/mocks/handlers/audit-events'
import { authRoutes } from '@/mocks/handlers/auth'
import { controlRoutes } from '@/mocks/handlers/controls'
import { documentRoutes } from '@/mocks/handlers/documents'
import { dsrRoutes } from '@/mocks/handlers/dsrs'
import { fileRoutes } from '@/mocks/handlers/files'
import { incidentRoutes } from '@/mocks/handlers/incidents'
import { linkRoutes } from '@/mocks/handlers/links'
import { meRoutes } from '@/mocks/handlers/me'
import { notificationRoutes } from '@/mocks/handlers/notifications'
import { orgRoutes } from '@/mocks/handlers/orgs'
import { piaRoutes } from '@/mocks/handlers/pias'
import { processingRoutes } from '@/mocks/handlers/processing'
import { registrationRoutes } from '@/mocks/handlers/registrations'
import { searchRoutes } from '@/mocks/handlers/search'
import { apiError, HttpError } from '@/mocks/http'
import { compile, match, resolveOrgCtx, type BaseCtx, type UserCtx } from '@/mocks/router'
import { getDb } from '@/mocks/store'

const routes = [
  ...authRoutes,
  ...meRoutes,
  ...orgRoutes,
  ...notificationRoutes,
  ...searchRoutes,
  ...auditEventRoutes,
  ...documentRoutes,
  ...controlRoutes,
  ...linkRoutes,
  ...fileRoutes,
  ...processingRoutes,
  ...piaRoutes,
  ...dsrRoutes,
  ...incidentRoutes,
  ...agreementRoutes,
  ...registrationRoutes,
].map(compile)

/** "150-400" (default) → random latency in that range; "0" disables. */
function latencyMs(): number {
  const spec = process.env.MOCK_LATENCY_MS ?? (process.env.VITEST ? '0' : '150-400')
  const [min = 0, max = min] = spec.split('-').map(Number)
  return min + Math.random() * Math.max(0, max - min)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Handles a request for /api/v1/* exactly as the FastAPI backend will:
 * same paths, same response shapes, same error envelope.
 */
export async function dispatchMock(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\/v1/, '') || '/'
  const method = req.method.toUpperCase()

  const delay = latencyMs()
  if (delay > 0) await sleep(delay)

  if (url.searchParams.get('simulate') === 'error') {
    return apiError(500, 'internal_error', 'Simulated server error (?simulate=error).')
  }

  const { matches } = match(routes, path)
  if (matches.length === 0) return apiError(404, 'not_found', `No endpoint for ${method} ${path}.`)
  const found = matches.find((m) => m.route.def.method === method)
  if (!found) {
    return apiError(405, 'method_not_allowed', `${method} isn’t supported on ${path}.`, undefined, {
      Allow: [...new Set(matches.map((m) => m.route.def.method))].join(', '),
    })
  }

  const db = getDb()
  let bodyCache: Promise<unknown> | undefined
  const base: BaseCtx = {
    req,
    url,
    query: url.searchParams,
    params: found.params,
    db,
    now: new Date(),
    json: () =>
      (bodyCache ??= req.text().then((t) => {
        if (!t) return {}
        try {
          return JSON.parse(t) as unknown
        } catch {
          throw new HttpError(400, 'validation_error', 'The request body isn’t valid JSON.')
        }
      })),
  }

  try {
    const def = found.route.def
    if (def.access === 'public') return await def.handler(base)

    const auth = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    const userId = token ? await verifyMockToken(token, 'access') : null
    const user = userId ? db.users.find((u) => u.id === userId) : undefined
    if (!user) return apiError(401, 'unauthenticated', 'Sign in to continue.')
    const userCtx: UserCtx = { ...base, user }

    if (def.access === 'user') return await def.handler(userCtx)
    return await def.handler(resolveOrgCtx(userCtx, def))
  } catch (err) {
    if (err instanceof HttpError) return apiError(err.status, err.code, err.message, err.fields)
    console.error('[mock api] unhandled error', method, path, err)
    return apiError(500, 'internal_error', 'The mock API hit an unexpected error.')
  }
}
