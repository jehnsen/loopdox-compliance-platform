import type { Metadata } from 'next'
import { HydrationBoundary } from '@tanstack/react-query'
import { qk } from '@/lib/api/query-keys'
import type { AgreementSummary } from '@/lib/api/types'
import { serverGet } from '@/lib/server/api'
import { prefetch } from '@/lib/server/prefetch'
import { ModuleGuard } from '@/features/shell/module-page'
import { AgreementPage } from '@/features/privacy/agreement-page'

export async function generateMetadata({
  params,
}: PageProps<'/[org]/privacy/agreements/[id]'>): Promise<Metadata> {
  const { org, id } = await params
  try {
    const a = await serverGet<AgreementSummary>(`/orgs/${org}/agreements/${encodeURIComponent(id)}`)
    return { title: `${a.ref} ${a.counterparty}` }
  } catch {
    return { title: 'Agreement' }
  }
}

export default async function Page({ params }: PageProps<'/[org]/privacy/agreements/[id]'>) {
  const { org, id } = await params
  const state = await prefetch([
    {
      queryKey: qk.privacy.detail(org, 'agreements', id),
      path: `/orgs/${org}/agreements/${encodeURIComponent(id)}`,
    },
  ])
  return (
    <HydrationBoundary state={state}>
      <ModuleGuard feature="privacy" permission="privacy.read">
        <AgreementPage id={id} />
      </ModuleGuard>
    </HydrationBoundary>
  )
}
