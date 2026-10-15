import type { Metadata } from 'next'
import { HydrationBoundary } from '@tanstack/react-query'
import { qk } from '@/lib/api/query-keys'
import { prefetch } from '@/lib/server/prefetch'
import { ModuleGuard } from '@/features/shell/module-page'
import { PiaPage } from '@/features/privacy/pia-page'

export const metadata: Metadata = { title: 'Impact assessment' }

export default async function Page({ params }: PageProps<'/[org]/privacy/pia/[id]'>) {
  const { org, id } = await params
  const state = await prefetch([
    {
      queryKey: qk.privacy.detail(org, 'pias', id),
      path: `/orgs/${org}/pias/${encodeURIComponent(id)}`,
    },
  ])
  return (
    <HydrationBoundary state={state}>
      <ModuleGuard feature="privacy" permission="privacy.read">
        <PiaPage id={id} />
      </ModuleGuard>
    </HydrationBoundary>
  )
}
