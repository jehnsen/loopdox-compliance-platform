import type { Org, Permission, Role } from '@/lib/api/types'
import { can } from '@/lib/auth/permissions'
import {
  FEATURE_INFO,
  hasFeature,
  minimumTierFor,
  TIER_LABELS,
  type Feature,
} from '@/lib/entitlements'
import { forbidden, HttpError } from '@/mocks/http'
import type { MockDB, MockMembership, MockUser } from '@/mocks/store'

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface BaseCtx {
  req: Request
  url: URL
  query: URLSearchParams
  params: Record<string, string>
  db: MockDB
  now: Date
  /** Parsed JSON body (or {} when empty). */
  json: () => Promise<unknown>
}

export interface UserCtx extends BaseCtx {
  user: MockUser
}

export interface OrgCtx extends UserCtx {
  org: Org
  roles: Role[]
  membership: MockMembership
  /** Throws 403 unless the caller's roles grant `permission`. */
  require: (permission: Permission, resource?: { status?: string }) => void
  can: (permission: Permission, resource?: { status?: string }) => boolean
}

type Result = Response | Promise<Response>

export type RouteDef =
  | { access: 'public'; method: Method; path: string; handler: (ctx: BaseCtx) => Result }
  | { access: 'user'; method: Method; path: string; handler: (ctx: UserCtx) => Result }
  | {
      access: 'org'
      method: Method
      path: string
      permission?: Permission
      feature?: Feature
      handler: (ctx: OrgCtx) => Result
    }

export const publicRoute = (
  method: Method,
  path: string,
  handler: (ctx: BaseCtx) => Result,
): RouteDef => ({
  access: 'public',
  method,
  path,
  handler,
})

export const userRoute = (
  method: Method,
  path: string,
  handler: (ctx: UserCtx) => Result,
): RouteDef => ({
  access: 'user',
  method,
  path,
  handler,
})

/** A route under /orgs/:org. The caller must be an active member; optional permission and plan feature. */
export const orgRoute = (
  method: Method,
  path: string,
  opts: { permission?: Permission; feature?: Feature },
  handler: (ctx: OrgCtx) => Result,
): RouteDef => ({ access: 'org', method, path: `/orgs/:org${path}`, ...opts, handler })

export interface CompiledRoute {
  def: RouteDef
  regex: RegExp
  keys: string[]
}

export function compile(def: RouteDef): CompiledRoute {
  const keys: string[] = []
  const pattern = def.path
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1))
        return '([^/]+)'
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { def, regex: new RegExp(`^${pattern}/?$`), keys }
}

export function match(
  routes: readonly CompiledRoute[],
  path: string,
): { matches: { route: CompiledRoute; params: Record<string, string> }[] } {
  const matches: { route: CompiledRoute; params: Record<string, string> }[] = []
  for (const route of routes) {
    const m = route.regex.exec(path)
    if (!m) continue
    const params: Record<string, string> = {}
    route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] ?? '')))
    matches.push({ route, params })
  }
  return { matches }
}

/** Resolves the org and membership for an /orgs/:org route, enforcing permission and plan. */
export function resolveOrgCtx(ctx: UserCtx, def: Extract<RouteDef, { access: 'org' }>): OrgCtx {
  const org = ctx.db.orgs.find((o) => o.slug === ctx.params.org)
  if (!org) throw new HttpError(404, 'not_found', 'Organisation not found.')
  const membership = ctx.db.memberships.find(
    (m) => m.orgId === org.id && m.userId === ctx.user.id && m.status === 'active',
  )
  // Same response as a missing org, so slugs can't be probed.
  if (!membership) throw new HttpError(404, 'not_found', 'Organisation not found.')
  if (membership.expiresAt && Date.parse(membership.expiresAt) < ctx.now.getTime()) {
    throw forbidden('Your guest access to this organisation has expired.')
  }
  const subject = { roles: membership.roles }
  if (def.feature && !hasFeature(org.tier, def.feature)) {
    const info = FEATURE_INFO[def.feature]
    throw new HttpError(
      403,
      'feature_not_in_plan',
      `${info.title} is included in the ${TIER_LABELS[minimumTierFor(def.feature)]} plan.`,
    )
  }
  if (def.permission && !can(subject, def.permission)) throw forbidden()
  return {
    ...ctx,
    org,
    roles: membership.roles,
    membership,
    can: (p, r) => can(subject, p, r),
    require: (p, r) => {
      if (!can(subject, p, r)) throw forbidden()
    },
  }
}
