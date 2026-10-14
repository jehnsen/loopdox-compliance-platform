import { forbidden, json, paginate } from '@/mocks/http'
import { orgRoute, type RouteDef } from '@/mocks/router'

export const auditEventRoutes: RouteDef[] = [
  orgRoute('GET', '/audit-events', {}, (ctx) => {
    const targetType = ctx.query.get('targetType')
    const targetId = ctx.query.get('targetId')
    // Record-level activity is visible to anyone who can see the record; the org-wide log is admin-only.
    if (!(targetType && targetId) && !ctx.can('audit_log.read')) throw forbidden()
    const events = ctx.db.auditEvents.filter(
      (e) =>
        e.orgId === ctx.org.id &&
        (!targetType || e.targetType === targetType) &&
        (!targetId || e.targetId === targetId),
    )
    return json(
      paginate(events, ctx.query, {
        defaultSort: '-at',
        search: (e) => [e.action, e.targetLabel, e.actor?.name],
        filters: {
          action: (e, v) => v.some((a) => e.action.startsWith(a)),
          actorId: (e, v) => v.includes(e.actor?.id ?? ''),
        },
      }),
    )
  }),
]
