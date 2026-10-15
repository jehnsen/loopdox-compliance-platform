import type { Metadata } from 'next'
import { HydrationBoundary } from '@tanstack/react-query'
import { qk } from '@/lib/api/query-keys'
import type { ProcessingActivitySummary } from '@/lib/api/types'
import { serverGet } from '@/lib/server/api'
import { prefetch } from '@/lib/server/prefetch'
import { ModuleGuard } from '@/features/shell/module-page'
import { ProcessingPage } from '@/features/privacy/processing-page'

export async function generateMetadata({
  params,
}: PageProps<'/[org]/privacy/processing/[id]'>): Promise<Metadata> {
  const { org, id } = await params
  try {
    const p = await serverGet<ProcessingActivitySummary>(`/orgs/${org}/processing-activities/${id}`)
    return { title: `${p.ref} ${p.name}` }
  } catch {
    return { title: 'Processing record' }
  }
}

export default async function Page({ params }: PageProps<'/[org]/privacy/processing/[id]'>) {
  const { org, id } = await params
  const state = await prefetch([
    {
      queryKey: qk.privacy.detail(org, 'processing', id),
      path: `/orgs/${org}/processing-activities/${encodeURIComponent(id)}`,
    },
  ])
  return (
    <HydrationBoundary state={state}>
      <ModuleGuard feature="privacy" permission="privacy.read">
        <ProcessingPage id={id} />
      </ModuleGuard>
    </HydrationBoundary>
  )
}
