'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type { NotificationList } from '@/lib/api/types'

export function useNotifications(org: string) {
  return useQuery({
    queryKey: qk.notifications(org),
    queryFn: ({ signal }) =>
      api.get<NotificationList>(orgPath(org, '/notifications'), {
        query: { pageSize: 20 },
        signal,
      }),
    refetchInterval: 60_000,
  })
}

export function useMarkNotificationsRead(org: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { ids: string[] } | { all: true }) =>
      api.post<undefined>(orgPath(org, '/notifications/read'), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications(org) }),
  })
}
