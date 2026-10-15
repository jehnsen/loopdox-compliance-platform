import { json, notFound, paginate } from '@/mocks/http'
import { evidenceItem } from '@/mocks/handlers/access'
import { orgRoute, type RouteDef } from '@/mocks/router'

/**
 * Evidence read endpoint. Items are created by the modules that produce them (access
 * review sign-off in M5); uploads, connectors and the full Evidence module are M6.
 */
export const evidenceRoutes: RouteDef[] = [
  // A control's evidence timeline, newest first.
  orgRoute(
    'GET',
    '/controls/:id/evidence',
    { permission: 'evidence.read', feature: 'evidence' },
    (ctx) => {
      const control = ctx.db.controls.find((c) => c.orgId === ctx.org.id && c.id === ctx.params.id)
      if (!control) throw notFound('Control')
      const items = ctx.db.evidence
        .filter((e) => e.orgId === ctx.org.id && e.controlId === control.id)
        .map((e) => evidenceItem(ctx, e))
      return json(
        paginate(items, ctx.query, {
          search: (e) => [e.summary, e.origin?.label],
          defaultSort: '-collectedAt',
          filters: {
            result: (e, v) => v.includes(e.result),
            source: (e, v) => v.includes(e.source),
          },
        }),
      )
    },
  ),
]
