import { hasFeature } from '@/lib/entitlements'
import { searchSources } from '@/mocks/handlers/search'
import { json, notFound, paginate } from '@/mocks/http'
import { orgRoute, type RouteDef } from '@/mocks/router'

/** Read endpoints for controls. Evidence and the full module arrive in M6. */
export const controlRoutes: RouteDef[] = [
  orgRoute('GET', '/controls', { permission: 'evidence.read', feature: 'evidence' }, (ctx) => {
    const controls = ctx.db.controls.filter((c) => c.orgId === ctx.org.id)
    return json(
      paginate(controls, ctx.query, {
        search: (c) => [c.reference, c.title, c.description],
        defaultSort: 'reference',
        filters: {
          framework: (c, v) => v.includes(c.framework),
          status: (c, v) => v.includes(c.status),
          documentId: (c, v) => c.documentIds.some((id) => v.includes(id)),
        },
      }),
    )
  }),

  orgRoute('GET', '/controls/:id', { permission: 'evidence.read', feature: 'evidence' }, (ctx) => {
    const control = ctx.db.controls.find((c) => c.orgId === ctx.org.id && c.id === ctx.params.id)
    if (!control) throw notFound('Control')
    return json(control)
  }),
]

// Controls are searchable by reference, title and description (evidence items join in M6).
searchSources.push({
  type: 'control',
  label: 'Controls',
  items: (ctx) => {
    if (!hasFeature(ctx.org.tier, 'evidence') || !ctx.can('evidence.read')) return []
    return ctx.db.controls
      .filter((c) => c.orgId === ctx.org.id)
      .map((c) => ({
        type: 'control' as const,
        id: c.id,
        ref: c.reference,
        title: c.title,
        href: `/${ctx.org.slug}/evidence/controls/${c.id}`,
        snippet: null,
        text: `${c.framework} ${c.description}`,
      }))
  },
})
