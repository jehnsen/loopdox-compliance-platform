'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type { SearchResponse } from '@/lib/api/types'

export function useSearch(org: string, q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: qk.search(org, term),
    queryFn: ({ signal }) =>
      api.get<SearchResponse>(orgPath(org, '/search'), { query: { q: term }, signal }),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
