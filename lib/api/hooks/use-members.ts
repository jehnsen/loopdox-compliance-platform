'use client'

import { useQuery } from '@tanstack/react-query'
import { api, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type { ListResponse, Member } from '@/lib/api/types'

/** All members of the org (small orgs: one page of up to 200). */
export function useMembers(org: string) {
  const query = { pageSize: 200, status: 'active' }
  return useQuery({
    queryKey: qk.members(org, query),
    queryFn: ({ signal }) =>
      api.get<ListResponse<Member>>(orgPath(org, '/members'), { query, signal }),
    select: (d) => d.items,
    staleTime: 5 * 60_000,
  })
}
