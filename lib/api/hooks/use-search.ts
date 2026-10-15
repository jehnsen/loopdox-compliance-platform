'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type { SearchResponse, SearchResultType } from '@/lib/api/types'

export interface SearchOptions {
  /** Only these result types. */
  types?: SearchResultType[]
  /** Results per group (default 8, at most 50). */
  limit?: number
}

export function useSearch(org: string, q: string, opts: SearchOptions = {}) {
  const term = q.trim()
  return useQuery({
    queryKey: qk.search(org, term, opts),
    queryFn: ({ signal }) =>
      api.get<SearchResponse>(orgPath(org, '/search'), {
        query: { q: term, type: opts.types, limit: opts.limit },
        signal,
      }),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
