'use client'

import { useQuery } from '@tanstack/react-query'
import { api, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type { OverviewResponse } from '@/lib/api/types'

/** The dashboard is always fetched fresh on arrival, so it reflects what you just did elsewhere. */
export function useOverview(org: string, enabled = true) {
  return useQuery({
    queryKey: qk.overview(org),
    queryFn: ({ signal }) => api.get<OverviewResponse>(orgPath(org, '/overview'), { signal }),
    enabled,
    staleTime: 0,
    refetchInterval: 60_000,
  })
}
