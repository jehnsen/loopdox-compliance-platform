import type { Metadata } from 'next'
import { HydrationBoundary } from '@tanstack/react-query'
import { qk } from '@/lib/api/query-keys'
import type { DocumentDetail } from '@/lib/api/types'
import { prefetch } from '@/lib/server/prefetch'
import { serverGet } from '@/lib/server/api'
import { ModuleGuard } from '@/features/shell/module-page'
import { PolicyPage } from '@/features/policies/policy-page'

export async function generateMetadata({
  params,
}: PageProps<'/[org]/policies/[docId]'>): Promise<Metadata> {
  const { org, docId } = await params
  try {
    const doc = await serverGet<DocumentDetail>(
      `/orgs/${org}/documents/${encodeURIComponent(docId)}`,
    )
    return { title: `${doc.docId} ${doc.title}` }
  } catch {
    return { title: 'Policy' }
  }
}

export default async function Page({ params }: PageProps<'/[org]/policies/[docId]'>) {
  const { org, docId } = await params
  const state = await prefetch([
    {
      queryKey: qk.documents.detail(org, docId),
      path: `/orgs/${org}/documents/${encodeURIComponent(docId)}`,
    },
    { queryKey: qk.documents.lookup(org), path: `/orgs/${org}/documents/lookup` },
  ])
  return (
    <HydrationBoundary state={state}>
      <ModuleGuard feature="policies" permission="policies.read">
        <PolicyPage id={docId} />
      </ModuleGuard>
    </HydrationBoundary>
  )
}
