import { formatInTimeZone } from 'date-fns-tz'
import type { MeResponse, MembershipSummary, Org, Tier, Usage } from '@/lib/api/types'
import { permissionsForRoles } from '@/lib/auth/permissions'
import { featureCap } from '@/lib/entitlements'
import { json } from '@/mocks/http'
import { userRoute, type RouteDef } from '@/mocks/router'
import type { MockDB } from '@/mocks/store'

const USER_LIMITS: Record<Tier, number | null> = {
  starter: 10,
  pro: 50,
  premium: null,
  visorshield_only: 25,
}
const STORAGE_LIMITS_MB: Record<Tier, number | null> = {
  starter: 1024,
  pro: 10_240,
  premium: 102_400,
  visorshield_only: 1024,
}
const CONNECTOR_LIMITS: Record<Tier, number | null> = {
  starter: 0,
  pro: 3,
  premium: null,
  visorshield_only: 0,
}

export function usageFor(db: MockDB, org: Org, now: Date): Usage {
  const month = formatInTimeZone(now, org.timezone, 'yyyy-MM')
  const asked = db.usage.find((u) => u.orgId === org.id && u.month === month)?.askQuestions ?? 0
  const users = db.memberships.filter((m) => m.orgId === org.id && m.status === 'active').length
  return {
    askQuestions: {
      used: asked,
      limit: featureCap(org.tier, 'ask.policy'),
      periodStart: `${month}-01`,
    },
    users: { used: users, limit: USER_LIMITS[org.tier] },
    storageMb: { used: org.tier === 'starter' ? 84 : 2_310, limit: STORAGE_LIMITS_MB[org.tier] },
    // A connector that is connected, or has failed and needs fixing, takes a slot.
    connectors: {
      used: db.connectors.filter((c) => c.orgId === org.id && c.status !== 'disconnected').length,
      limit: CONNECTOR_LIMITS[org.tier],
    },
  }
}

export const meRoutes: RouteDef[] = [
  userRoute('GET', '/me', (ctx) => {
    const { db, user } = ctx
    const active = db.memberships.filter(
      (m) =>
        m.userId === user.id &&
        m.status === 'active' &&
        (!m.expiresAt || Date.parse(m.expiresAt) > ctx.now.getTime()),
    )
    const memberships: MembershipSummary[] = active.flatMap((m) => {
      const org = db.orgs.find((o) => o.id === m.orgId)
      return org
        ? [{ org: { id: org.id, slug: org.slug, name: org.name, tier: org.tier }, roles: m.roles }]
        : []
    })
    const slug =
      ctx.query.get('org') ?? (memberships.length === 1 ? memberships[0]?.org.slug : null)
    const membership = slug ? memberships.find((m) => m.org.slug === slug) : undefined
    const org = membership ? (db.orgs.find((o) => o.id === membership.org.id) ?? null) : null
    const { password: _password, ...publicUser } = user
    const body: MeResponse = {
      user: publicUser,
      memberships,
      org,
      roles: membership?.roles ?? [],
      tier: org?.tier ?? null,
      permissions: membership ? permissionsForRoles(membership.roles) : [],
      usage: org ? usageFor(db, org, ctx.now) : null,
      apiMode: 'mock',
    }
    return json(body)
  }),
]
