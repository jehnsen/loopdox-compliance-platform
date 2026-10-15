import type { Metadata } from 'next'
import { HydrationBoundary } from '@tanstack/react-query'
import { qk } from '@/lib/api/query-keys'
import { prefetch } from '@/lib/server/prefetch'
import { ModuleGuard } from '@/features/shell/module-page'
import { AskPage } from '@/features/ask/ask-page'

export const metadata: Metadata = { title: 'Ask' }

export default async function Page({ params }: PageProps<'/[org]/ask/[threadId]'>) {
  const { org, threadId } = await params
  // Conversations are private: another person's thread ID is a 404.
  const state = await prefetch([
    {
      queryKey: qk.ask.thread(org, threadId),
      path: `/orgs/${org}/ask/threads/${encodeURIComponent(threadId)}`,
    },
  ])
  return (
    <HydrationBoundary state={state}>
      <ModuleGuard feature="ask.policy" permission="ask.use">
        <AskPage initialThreadId={threadId} />
      </ModuleGuard>
    </HydrationBoundary>
  )
}
