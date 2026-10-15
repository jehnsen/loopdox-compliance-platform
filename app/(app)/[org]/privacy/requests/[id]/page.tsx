import type { Metadata } from 'next'
import { HydrationBoundary } from '@tanstack/react-query'
import { qk } from '@/lib/api/query-keys'
import type { DsrDetail } from '@/lib/api/types'
import { serverGet } from '@/lib/server/api'
import { prefetch } from '@/lib/server/prefetch'
import { ModuleGuard } from '@/features/shell/module-page'
import { DsrPage } from '@/features/privacy/dsr-page'

export async function generateMetadata({
  params,
}: PageProps<'/[org]/privacy/requests/[id]'>): Promise<Metadata> {
  const { org, id } = await params
  try {
    // The ref only: titles never carry the requester's identity.
    const d = await serverGet<DsrDetail>(`/orgs/${org}/dsrs/${encodeURIComponent(id)}`)
    return { title: d.ref }
  } catch {
    return { title: 'Data subject request' }
  }
}

export default async function Page({ params }: PageProps<'/[org]/privacy/requests/[id]'>) {
  const { org, id } = await params
  const state = await prefetch([
    {
      queryKey: qk.privacy.detail(org, 'dsrs', id),
      path: `/orgs/${org}/dsrs/${encodeURIComponent(id)}`,
    },
  ])
  return (
    <HydrationBoundary state={state}>
      <ModuleGuard feature="privacy" permission="privacy.read">
        <DsrPage id={id} />
      </ModuleGuard>
    </HydrationBoundary>
  )
}
