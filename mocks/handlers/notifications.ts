import { z } from 'zod'
import type { NotificationList } from '@/lib/api/types'
import { json, paginate, parse } from '@/mocks/http'
import { orgRoute, type RouteDef } from '@/mocks/router'
import { commit } from '@/mocks/store'

const markReadSchema = z.union([
  z.object({ ids: z.array(z.string()).min(1) }),
  z.object({ all: z.literal(true) }),
])

export const notificationRoutes: RouteDef[] = [
  orgRoute('GET', '/notifications', {}, (ctx) => {
    const mine = ctx.db.notifications.filter(
      (n) => n.orgId === ctx.org.id && n.userId === ctx.user.id,
    )
    const page = paginate(mine, ctx.query, {
      defaultSort: '-at',
      filters: { unread: (n, v) => (v[0] === 'true' ? n.readAt === null : true) },
    })
    const body: NotificationList = { ...page, unread: mine.filter((n) => !n.readAt).length }
    return json(body)
  }),

  orgRoute('POST', '/notifications/read', {}, async (ctx) => {
    const input = parse(markReadSchema, await ctx.json())
    const at = ctx.now.toISOString()
    for (const n of ctx.db.notifications) {
      if (n.orgId !== ctx.org.id || n.userId !== ctx.user.id || n.readAt) continue
      if ('all' in input || input.ids.includes(n.id)) n.readAt = at
    }
    commit()
    return new Response(null, { status: 204 })
  }),
]
