'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type {
  AiAssessmentDecide,
  AiAssessmentSummary,
  AiAssessmentUpdate,
  AiEvent,
  AiKeyInput,
  AiProfile,
  AiProfileUpdate,
  AiPromptTest,
  AiPromptTestResult,
  AiProviderKey,
  AiStats,
  AiUseCaseStatus,
  AiUseCaseSummary,
  ListQuery,
  ListResponse,
} from '@/lib/api/types'
import type { UseCaseFormValues } from '@/lib/schemas/ai'

const RESOURCES = {
  useCases: '/ai/use-cases',
  assessments: '/ai/assessments',
  profiles: '/ai/profiles',
  keys: '/ai/keys',
  events: '/ai/events',
} as const
type Resource = keyof typeof RESOURCES

const path = (org: string, resource: Resource, rest = '') =>
  orgPath(org, `${RESOURCES[resource]}${rest}`)

function useList<T>(org: string, resource: Resource, query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: qk.ai.list(org, resource, query),
    queryFn: ({ signal }) => api.get<ListResponse<T>>(path(org, resource), { query, signal }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

function useDetail<T>(org: string, resource: Resource, id: string) {
  return useQuery({
    queryKey: qk.ai.detail(org, resource, id),
    queryFn: ({ signal }) =>
      api.get<T>(path(org, resource, `/${encodeURIComponent(id)}`), { signal }),
    enabled: Boolean(id),
  })
}

/**
 * An AI Governance write. Stores the returned record when `resource` is given and
 * refreshes the module, links, the dashboard, search and activity.
 */
function useWrite<TVars, TRes>(
  org: string,
  fn: (vars: TVars) => Promise<TRes>,
  resource?: Resource,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      if (resource && data && typeof data === 'object' && 'id' in data) {
        qc.setQueryData(qk.ai.detail(org, resource, String(data.id)), data)
      }
      void qc.invalidateQueries({ queryKey: qk.ai.all(org) })
      void qc.invalidateQueries({ queryKey: qk.privacy.all(org) })
      void qc.invalidateQueries({ queryKey: qk.overview(org) })
      void qc.invalidateQueries({ queryKey: [org, 'audit-events'] })
      void qc.invalidateQueries({ queryKey: [org, 'search'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Use cases and assessments
// ---------------------------------------------------------------------------

export const useUseCases = (org: string, query: ListQuery) =>
  useList<AiUseCaseSummary>(org, 'useCases', query)

export const useUseCase = (org: string, id: string) =>
  useDetail<AiUseCaseSummary>(org, 'useCases', id)

export const useCreateUseCase = (org: string) =>
  useWrite(
    org,
    (body: UseCaseFormValues) => api.post<AiUseCaseSummary>(path(org, 'useCases'), body),
    'useCases',
  )

export const useUpdateUseCase = (org: string, id: string) =>
  useWrite(
    org,
    (body: UseCaseFormValues & { ifVersion: number; status?: AiUseCaseStatus }) =>
      api.patch<AiUseCaseSummary>(path(org, 'useCases', `/${id}`), body),
    'useCases',
  )

export const useDeleteUseCase = (org: string, id: string) =>
  useWrite(org, () => api.delete<undefined>(path(org, 'useCases', `/${id}`)))

export const useAssessments = (org: string, query: ListQuery) =>
  useList<AiAssessmentSummary>(org, 'assessments', query)

export const useAssessment = (org: string, id: string) =>
  useDetail<AiAssessmentSummary>(org, 'assessments', id)

export const useStartAssessment = (org: string) =>
  useWrite(
    org,
    (useCaseId: string) => api.post<AiAssessmentSummary>(path(org, 'assessments'), { useCaseId }),
    'assessments',
  )

export const useUpdateAssessment = (org: string, id: string) =>
  useWrite(
    org,
    (body: AiAssessmentUpdate) =>
      api.patch<AiAssessmentSummary>(path(org, 'assessments', `/${id}`), body),
    'assessments',
  )

export const useDecideAssessment = (org: string, id: string) =>
  useWrite(
    org,
    (body: AiAssessmentDecide) =>
      api.post<AiAssessmentSummary>(path(org, 'assessments', `/${id}/decide`), body),
    'assessments',
  )

export const useCancelAssessment = (org: string, id: string) =>
  useWrite(org, () => api.delete<undefined>(path(org, 'assessments', `/${id}`)))

// ---------------------------------------------------------------------------
// Profiles, keys
// ---------------------------------------------------------------------------

export const useProfiles = (org: string) => useList<AiProfile>(org, 'profiles', { pageSize: 50 })

export const useUpdateProfile = (org: string, id: string) =>
  useWrite(
    org,
    (body: AiProfileUpdate) => api.patch<AiProfile>(path(org, 'profiles', `/${id}`), body),
    'profiles',
  )

/** Doesn't change anything, so it isn't a cache-refreshing write. */
export const useTestPrompt = (org: string, id: string) =>
  useMutation({
    mutationFn: (body: AiPromptTest) =>
      api.post<AiPromptTestResult>(path(org, 'profiles', `/${id}/test`), body),
  })

export const useKeys = (org: string, query: ListQuery) => useList<AiProviderKey>(org, 'keys', query)

/**
 * The key goes up in the request and is gone from the browser's memory once the
 * mutation settles: callers `reset()` it, so the cache never holds the key.
 */
export const useAddKey = (org: string) =>
  useWrite(org, (body: AiKeyInput) => api.post<AiProviderKey>(path(org, 'keys'), body))

export const useRotateKey = (org: string, id: string) =>
  useWrite(org, (body: Pick<AiKeyInput, 'key' | 'reference' | 'last4'>) =>
    api.post<AiProviderKey>(path(org, 'keys', `/${id}/rotate`), body),
  )

export const useDeleteKey = (org: string, id: string) =>
  useWrite(org, () => api.delete<undefined>(path(org, 'keys', `/${id}`)))

// ---------------------------------------------------------------------------
// Statistics and events
// ---------------------------------------------------------------------------

export function useAiStats(org: string, query: { from: string; to: string }) {
  return useQuery({
    queryKey: qk.ai.stats(org, query),
    queryFn: ({ signal }) => api.get<AiStats>(orgPath(org, '/ai/stats'), { query, signal }),
    placeholderData: keepPreviousData,
    // Proxy health changes by the minute.
    refetchInterval: 60_000,
  })
}

export const useAiEvents = (org: string, query: ListQuery) => useList<AiEvent>(org, 'events', query)

export function useEventFacets(org: string) {
  return useQuery({
    queryKey: qk.ai.facets(org),
    queryFn: ({ signal }) =>
      api.get<{
        apps: string[]
        profiles: string[]
        users: { id: string; name: string }[]
      }>(orgPath(org, '/ai/events/facets'), { signal }),
  })
}
