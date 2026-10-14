import type { Member } from '@/lib/api/types'
import { json, paginate } from '@/mocks/http'
import { orgRoute, type RouteDef } from '@/mocks/router'

export const orgRoutes: RouteDef[] = [
  orgRoute('GET', '', {}, (ctx) => json(ctx.org)),

  orgRoute('GET', '/members', {}, (ctx) => {
    const members: Member[] = ctx.db.memberships
      .filter((m) => m.orgId === ctx.org.id)
      .flatMap((m) => {
        const u = ctx.db.users.find((x) => x.id === m.userId)
        if (!u) return []
        return [
          {
            id: m.id,
            orgId: m.orgId,
            userId: u.id,
            name: u.name,
            email: u.email,
            title: u.title,
            roles: m.roles,
            status: m.status,
            expiresAt: m.expiresAt,
            invitedAt: m.invitedAt,
            joinedAt: m.joinedAt,
            version: m.version,
          },
        ]
      })
    return json(
      paginate(members, ctx.query, {
        search: (m) => [m.name, m.email, m.title],
        filters: {
          role: (m, v) => m.roles.some((r) => v.includes(r)),
          status: (m, v) => v.includes(m.status),
        },
        defaultSort: 'name',
      }),
    )
  }),
]
