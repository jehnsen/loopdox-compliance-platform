'use client'

import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { api } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type { MeResponse, Org, Tier } from '@/lib/api/types'

export interface Session extends Omit<MeResponse, 'org' | 'tier'> {
  org: Org
  tier: Tier
}

const SessionContext = createContext<Session | null>(null)

/**
 * Holds the signed-in user's view of the current org (/me?org=…). The server layout
 * passes the initial value, so the shell renders without a loading state.
 */
export function SessionProvider({ initial, children }: { initial: Session; children: ReactNode }) {
  const slug = initial.org.slug
  const { data } = useQuery({
    queryKey: qk.me(slug),
    queryFn: ({ signal }) => api.get<MeResponse>('/me', { query: { org: slug }, signal }),
    initialData: initial,
    staleTime: 60_000,
  })
  const session = useMemo<Session>(
    () => (data?.org && data.tier ? { ...data, org: data.org, tier: data.tier } : initial),
    [data, initial],
  )
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession must be used inside <SessionProvider>')
  return s
}

/** Current org slug, for building /[org]/… links and /orgs/:org API paths. */
export function useOrgSlug(): string {
  return useSession().org.slug
}
