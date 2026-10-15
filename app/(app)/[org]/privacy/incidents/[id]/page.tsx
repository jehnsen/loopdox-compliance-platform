import type { Metadata } from 'next'
import { HydrationBoundary } from '@tanstack/react-query'
import { qk } from '@/lib/api/query-keys'
import type { IncidentSummary } from '@/lib/api/types'
import { serverGet } from '@/lib/server/api'
import { prefetch } from '@/lib/server/prefetch'
import { ModuleGuard } from '@/features/shell/module-page'
import { IncidentPage } from '@/features/privacy/incident-page'

export async function generateMetadata({
  params,
}: PageProps<'/[org]/privacy/incidents/[id]'>): Promise<Metadata> {
  const { org, id } = await params
  try {
    const i = await serverGet<IncidentSummary>(`/orgs/${org}/incidents/${encodeURIComponent(id)}`)
    return { title: `${i.ref} ${i.title}` }
  } catch {
    return { title: 'Incident' }
  }
}

export default async function Page({ params }: PageProps<'/[org]/privacy/incidents/[id]'>) {
  const { org, id } = await params
  // Prefetched so the 72-hour clock is in the first paint.
  const state = await prefetch([
    {
      queryKey: qk.privacy.detail(org, 'incidents', id),
      path: `/orgs/${org}/incidents/${encodeURIComponent(id)}`,
    },
  ])
  return (
    <HydrationBoundary state={state}>
      <ModuleGuard feature="privacy" permission="privacy.read">
        <IncidentPage id={id} />
      </ModuleGuard>
    </HydrationBoundary>
  )
}
