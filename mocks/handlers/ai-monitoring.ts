import type { AiEvent } from '@/lib/api/types'
import { statsFor } from '@/mocks/ai'
import { json, paginate } from '@/mocks/http'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { todayInTz } from '@/lib/utils/dates'

const opts = { feature: 'aiGovernance' as const, permission: 'ai.read' as const }

const orgEvents = (ctx: OrgCtx): AiEvent[] => ctx.db.aiEvents.filter((e) => e.orgId === ctx.org.id)

export const aiMonitoringRoutes: RouteDef[] = [
  orgRoute('GET', '/ai/stats', opts, (ctx) => json(statsFor(ctx))),

  /**
   * The event stream. Each event carries the masked sample only: the proxy replaces
   * what it found before anything reaches LoopDox, so a raw prompt can't appear here.
   */
  orgRoute('GET', '/ai/events', opts, (ctx) => {
    const tz = ctx.org.timezone
    const day = (e: AiEvent) => todayInTz(tz, new Date(e.at))
    return json(
      paginate(orgEvents(ctx), ctx.query, {
        search: (e) => [e.app, e.userName, e.reason, e.maskedSample, e.profile],
        defaultSort: '-at',
        filters: {
          action: (e, v) => v.includes(e.action),
          app: (e, v) => v.includes(e.app),
          profile: (e, v) => v.includes(e.profile),
          user: (e, v) => v.includes(e.userId ?? 'service'),
          from: (e, v) => day(e) >= (v[0] ?? ''),
          to: (e, v) => day(e) <= (v[0] ?? '9999'),
        },
      }),
    )
  }),

  // The values the Events filters offer.
  orgRoute('GET', '/ai/events/facets', opts, (ctx) => {
    const events = orgEvents(ctx)
    const apps = [...new Set(events.map((e) => e.app))].sort()
    const profiles = [...new Set(events.map((e) => e.profile))].sort()
    const users = [...new Map(events.map((e) => [e.userId ?? 'service', e.userName])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return json({ apps, profiles, users })
  }),
]
