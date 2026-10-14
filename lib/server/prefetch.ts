import 'server-only'
import { dehydrate, QueryClient, type DehydratedState, type QueryKey } from '@tanstack/react-query'
import { notFound } from 'next/navigation'
import { serverGet, ServerApiError } from '@/lib/server/api'

/**
 * Prefetches queries on the server so the page renders with data on first paint.
 * A 404 renders the not-found page; other errors are left for the client to show.
 */
export async function prefetch(
  entries: { queryKey: QueryKey; path: string }[],
): Promise<DehydratedState> {
  const qc = new QueryClient()
  await Promise.all(
    entries.map(async ({ queryKey, path }) => {
      try {
        qc.setQueryData(queryKey, await serverGet(path))
      } catch (e) {
        if (e instanceof ServerApiError && e.status === 404) notFound()
        if (!(e instanceof ServerApiError)) throw e
      }
    }),
  )
  return dehydrate(qc)
}
