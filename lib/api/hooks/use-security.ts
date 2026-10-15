'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type {
  AccessGrantInput,
  AccessGrantSummary,
  AccessLevel,
  AccessReviewSummary,
  ChangeInput,
  ChangeSummary,
  Control,
  CreateAccessReviewRequest,
  DecisionInput,
  DecisionSummary,
  EvidenceItem,
  ListQuery,
  ListResponse,
  ReviewDecision,
  RiskInput,
  RiskSummary,
  SecretRecordInput,
  SecretRecordSummary,
  SystemInput,
  SystemSummary,
} from '@/lib/api/types'

/** API paths for each security resource. */
export const SECURITY_RESOURCES = {
  systems: '/systems',
  grants: '/access-grants',
  reviews: '/access-reviews',
  secrets: '/secret-records',
  changes: '/changes',
  risks: '/risks',
  decisions: '/decisions',
} as const
type Resource = keyof typeof SECURITY_RESOURCES

const path = (org: string, resource: Resource, rest = '') =>
  orgPath(org, `${SECURITY_RESOURCES[resource]}${rest}`)

function useList<T>(org: string, resource: Resource, query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: qk.security.list(org, resource, query),
    queryFn: ({ signal }) => api.get<ListResponse<T>>(path(org, resource), { query, signal }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

function useDetail<T>(org: string, resource: Resource, id: string, fresh = false) {
  return useQuery({
    queryKey: qk.security.detail(org, resource, id),
    queryFn: ({ signal }) =>
      api.get<T>(path(org, resource, `/${encodeURIComponent(id)}`), { signal }),
    refetchOnMount: fresh ? 'always' : true,
    enabled: Boolean(id),
  })
}

/**
 * A security write. On success it stores the returned detail (when `resource` is
 * given) and refreshes the security registers, links, the dashboard, evidence and
 * activity for the org.
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
        qc.setQueryData(qk.security.detail(org, resource, String(data.id)), data)
      }
      void qc.invalidateQueries({ queryKey: qk.security.all(org) })
      // LinkedRecords on privacy and policy pages read the same relations.
      void qc.invalidateQueries({ queryKey: qk.privacy.all(org) })
      void qc.invalidateQueries({ queryKey: [org, 'controls'] })
      void qc.invalidateQueries({ queryKey: qk.overview(org) })
      void qc.invalidateQueries({ queryKey: qk.notifications(org) })
      void qc.invalidateQueries({ queryKey: [org, 'audit-events'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

export const useSystems = (org: string, query: ListQuery) =>
  useList<SystemSummary>(org, 'systems', query)

export const useSystem = (org: string, id: string, fresh = false) =>
  useDetail<SystemSummary>(org, 'systems', id, fresh)

export const useCreateSystem = (org: string) =>
  useWrite(
    org,
    (body: SystemInput) => api.post<SystemSummary>(path(org, 'systems'), body),
    'systems',
  )

export const useUpdateSystem = (org: string, id: string) =>
  useWrite(
    org,
    (body: SystemInput & { ifVersion: number }) =>
      api.patch<SystemSummary>(path(org, 'systems', `/${id}`), body),
    'systems',
  )

export const useDeleteSystem = (org: string, id: string) =>
  useWrite(org, () => api.delete<undefined>(path(org, 'systems', `/${id}`)))

// ---------------------------------------------------------------------------
// Access grants and reviews
// ---------------------------------------------------------------------------

export const useGrants = (org: string, query: ListQuery) =>
  useList<AccessGrantSummary>(org, 'grants', query)

export const useSaveGrant = (org: string) =>
  useWrite(org, ({ id, ...body }: AccessGrantInput & { id?: string; ifVersion?: number }) =>
    id
      ? api.patch<AccessGrantSummary>(path(org, 'grants', `/${id}`), body)
      : api.post<AccessGrantSummary>(path(org, 'grants'), body),
  )

export const useRevokeGrant = (org: string) =>
  useWrite(org, ({ id, ifVersion }: { id: string; ifVersion: number }) =>
    api.post<AccessGrantSummary>(path(org, 'grants', `/${id}/revoke`), { ifVersion }),
  )

export const useAccessReviews = (org: string, query: ListQuery) =>
  useList<AccessReviewSummary>(org, 'reviews', query)

export const useAccessReview = (org: string, id: string) =>
  useDetail<AccessReviewSummary>(org, 'reviews', id)

export const useCreateAccessReview = (org: string) =>
  useWrite(
    org,
    (body: CreateAccessReviewRequest) =>
      api.post<AccessReviewSummary>(path(org, 'reviews'), body),
    'reviews',
  )

export interface DecisionVars {
  grantId: string
  decision: ReviewDecision | null
  note?: string
  newLevel?: AccessLevel | null
}

/**
 * Keep / Revoke / Change on one grant. Decisions run one at a time and read the review's
 * version from the cache when they start, so clicking quickly never causes a false conflict.
 */
export function useDecide(org: string, reviewId: string) {
  const qc = useQueryClient()
  const key = qk.security.detail(org, 'reviews', reviewId)
  return useMutation({
    scope: { id: `review-${reviewId}` },
    mutationFn: ({ grantId, ...body }: DecisionVars) => {
      const current = qc.getQueryData<AccessReviewSummary>(key)
      return api.post<AccessReviewSummary>(
        path(org, 'reviews', `/${reviewId}/items/${encodeURIComponent(grantId)}`),
        { ...body, ifVersion: current?.version ?? 0 },
      )
    },
    onSuccess: (data) => qc.setQueryData(key, data),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.security.all(org) }),
  })
}

export function useKeepAll(org: string, reviewId: string) {
  const qc = useQueryClient()
  const key = qk.security.detail(org, 'reviews', reviewId)
  return useMutation({
    scope: { id: `review-${reviewId}` },
    mutationFn: (grantIds?: string[]) =>
      api.post<AccessReviewSummary>(path(org, 'reviews', `/${reviewId}/keep-all`), {
        ifVersion: qc.getQueryData<AccessReviewSummary>(key)?.version ?? 0,
        grantIds,
      }),
    onSuccess: (data) => qc.setQueryData(key, data),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.security.all(org) }),
  })
}

export const useSignOffReview = (org: string, id: string) =>
  useWrite(
    org,
    (ifVersion: number) =>
      api.post<AccessReviewSummary>(path(org, 'reviews', `/${id}/sign-off`), { ifVersion }),
    'reviews',
  )

// ---------------------------------------------------------------------------
// Secrets, changes
// ---------------------------------------------------------------------------

export const useSecrets = (org: string, query: ListQuery) =>
  useList<SecretRecordSummary>(org, 'secrets', query)

export const useSaveSecret = (org: string) =>
  useWrite(org, ({ id, ...body }: SecretRecordInput & { id?: string; ifVersion?: number }) =>
    id
      ? api.patch<SecretRecordSummary>(path(org, 'secrets', `/${id}`), body)
      : api.post<SecretRecordSummary>(path(org, 'secrets'), body),
  )

export const useMarkRotated = (org: string) =>
  useWrite(org, ({ id, ifVersion }: { id: string; ifVersion: number }) =>
    api.post<SecretRecordSummary>(path(org, 'secrets', `/${id}/mark-rotated`), { ifVersion }),
  )

export const useDeleteSecret = (org: string) =>
  useWrite(org, (id: string) => api.delete<undefined>(path(org, 'secrets', `/${id}`)))

export const useChanges = (org: string, query: ListQuery) =>
  useList<ChangeSummary>(org, 'changes', query)

export const useSaveChange = (org: string) =>
  useWrite(org, ({ id, ...body }: ChangeInput & { id?: string; ifVersion?: number }) =>
    id
      ? api.patch<ChangeSummary>(path(org, 'changes', `/${id}`), body)
      : api.post<ChangeSummary>(path(org, 'changes'), body),
  )

export const useReviewChange = (org: string) =>
  useWrite(org, ({ id, ...body }: { id: string; ifVersion: number; note: string }) =>
    api.post<ChangeSummary>(path(org, 'changes', `/${id}/review`), body),
  )

// ---------------------------------------------------------------------------
// Risks and decisions
// ---------------------------------------------------------------------------

export const useRisks = (org: string, query: ListQuery) =>
  useList<RiskSummary>(org, 'risks', query)

export const useRisk = (org: string, id: string, fresh = false) =>
  useDetail<RiskSummary>(org, 'risks', id, fresh)

export const useSaveRisk = (org: string, id?: string) =>
  useWrite(
    org,
    (body: RiskInput & { ifVersion?: number }) =>
      id
        ? api.patch<RiskSummary>(path(org, 'risks', `/${id}`), body)
        : api.post<RiskSummary>(path(org, 'risks'), body),
    'risks',
  )

export const useDeleteRisk = (org: string, id: string) =>
  useWrite(org, () => api.delete<undefined>(path(org, 'risks', `/${id}`)))

export const useDecisions = (org: string, query: ListQuery) =>
  useList<DecisionSummary>(org, 'decisions', query)

export const useDecision = (org: string, id: string, fresh = false) =>
  useDetail<DecisionSummary>(org, 'decisions', id, fresh)

export const useSaveDecision = (org: string, id?: string) =>
  useWrite(
    org,
    (body: DecisionInput & { ifVersion?: number }) =>
      id
        ? api.patch<DecisionSummary>(path(org, 'decisions', `/${id}`), body)
        : api.post<DecisionSummary>(path(org, 'decisions'), body),
    'decisions',
  )

export const useSupersedeDecision = (org: string, id: string) =>
  useWrite(
    org,
    (body: DecisionInput & { ifVersion: number }) =>
      api.post<DecisionSummary>(path(org, 'decisions', `/${id}/supersede`), body),
    'decisions',
  )

export const useDeleteDecision = (org: string, id: string) =>
  useWrite(org, () => api.delete<undefined>(path(org, 'decisions', `/${id}`)))

// ---------------------------------------------------------------------------
// Controls and their evidence (the full Evidence module is M6)
// ---------------------------------------------------------------------------

export function useControl(org: string, id: string) {
  return useQuery({
    queryKey: qk.control(org, id),
    queryFn: ({ signal }) => api.get<Control>(orgPath(org, `/controls/${encodeURIComponent(id)}`), { signal }),
    enabled: Boolean(id),
  })
}

export function useControlEvidence(org: string, id: string) {
  return useQuery({
    queryKey: qk.controlEvidence(org, id),
    queryFn: ({ signal }) =>
      api.get<ListResponse<EvidenceItem>>(orgPath(org, `/controls/${encodeURIComponent(id)}/evidence`), {
        query: { pageSize: 100 },
        signal,
      }),
    enabled: Boolean(id),
    staleTime: 0,
  })
}
