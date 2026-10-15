import { frameworkRank } from '@/lib/evidence'
import { hasFeature } from '@/lib/entitlements'
import { controlSummary, orgControls, visibleDocumentIds } from '@/mocks/evidence'
import { searchSources } from '@/mocks/handlers/search'
import { json, notFound, paginate } from '@/mocks/http'
import { orgRoute, type RouteDef } from '@/mocks/router'

/** Read endpoints for controls. Their evidence is in handlers/evidence.ts. */
export const controlRoutes: RouteDef[] = [
  orgRoute('GET', '/controls', { permission: 'evidence.read', feature: 'evidence' }, (ctx) => {
    const visible = visibleDocumentIds(ctx)
    // Default order: ISO 27001 first, then the Data Privacy Act, NPC and internal controls.
    // Within a framework, "A.5.2" comes before "A.5.10".
    const controls = orgControls(ctx)
      .sort(
        (a, b) =>
          frameworkRank(a.framework) - frameworkRank(b.framework) ||
          a.reference.localeCompare(b.reference, 'en', { numeric: true }),
      )
      .map((c) => controlSummary(ctx, c, visible))
    return json(
      paginate(controls, ctx.query, {
        search: (c) => [c.reference, c.title, c.description],
        filters: {
          framework: (c, v) => v.includes(c.framework),
          status: (c, v) => v.includes(c.status),
          documentId: (c, v) => c.documentIds.some((id) => v.includes(id)),
          owner: (c, v) => v.includes(c.owner),
        },
      }),
    )
  }),

  orgRoute('GET', '/controls/:id', { permission: 'evidence.read', feature: 'evidence' }, (ctx) => {
    const control = orgControls(ctx).find((c) => c.id === ctx.params.id)
    if (!control) throw notFound('Control')
    return json(controlSummary(ctx, control))
  }),
]

// Controls are searchable by reference, title and description.
searchSources.push({
  type: 'control',
  label: 'Controls',
  items: (ctx) => {
    if (!hasFeature(ctx.org.tier, 'evidence') || !ctx.can('evidence.read')) return []
    return orgControls(ctx).map((c) => ({
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
