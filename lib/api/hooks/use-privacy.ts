'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type {
  AgreementInput,
  AgreementSummary,
  CreateDsrRequest,
  CreatePiaRequest,
  CreateRiskRequest,
  DsrDetail,
  DsrSummary,
  DsrTransitionRequest,
  IncidentReceipt,
  IncidentSummary,
  LinkRequest,
  LinksResponse,
  ListQuery,
  ListResponse,
  PiaSummary,
  ProcessingActivityInput,
  ProcessingActivitySummary,
  RecordNotificationRequest,
  RecordRef,
  RecordType,
  RegistrationInput,
  RegistrationSummary,
  ReportIncidentRequest,
  RevealRequest,
  RevealResponse,
  Risk,
  SignOffPiaRequest,
  TrainingRecordInput,
  TrainingRecordSummary,
  UpdateDsrRequest,
  UpdateIncidentRequest,
  UpdateNoticesRequest,
  UpdatePiaRequest,
} from '@/lib/api/types'

/** API paths for each privacy resource. */
export const PRIVACY_RESOURCES = {
  processing: '/processing-activities',
  pias: '/pias',
  dsrs: '/dsrs',
  incidents: '/incidents',
  agreements: '/agreements',
  registrations: '/registrations',
  training: '/training-records',
} as const
type Resource = keyof typeof PRIVACY_RESOURCES

const path = (org: string, resource: Resource, rest = '') =>
  orgPath(org, `${PRIVACY_RESOURCES[resource]}${rest}`)

function useList<T>(org: string, resource: Resource, query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: qk.privacy.list(org, resource, query),
    queryFn: ({ signal }) => api.get<ListResponse<T>>(path(org, resource), { query, signal }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

function useDetail<T>(org: string, resource: Resource, id: string, fresh = false) {
  return useQuery({
    queryKey: qk.privacy.detail(org, resource, id),
    queryFn: ({ signal }) =>
      api.get<T>(path(org, resource, `/${encodeURIComponent(id)}`), { signal }),
    refetchOnMount: fresh ? 'always' : true,
    enabled: Boolean(id),
  })
}

/**
 * A privacy write. On success it stores the returned detail (when `resource` is
 * given) and refreshes every privacy query, notifications and activity for the org.
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
        qc.setQueryData(qk.privacy.detail(org, resource, String(data.id)), data)
      }
      void qc.invalidateQueries({ queryKey: qk.privacy.all(org) })
      void qc.invalidateQueries({ queryKey: qk.notifications(org) })
      void qc.invalidateQueries({ queryKey: [org, 'audit-events'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Processing records
// ---------------------------------------------------------------------------

export const useProcessingActivities = (org: string, query: ListQuery, enabled = true) =>
  useList<ProcessingActivitySummary>(org, 'processing', query, enabled)

export const useProcessingActivity = (org: string, id: string, fresh = false) =>
  useDetail<ProcessingActivitySummary>(org, 'processing', id, fresh)

export const useCreateProcessing = (org: string) =>
  useWrite(
    org,
    (body: ProcessingActivityInput) =>
      api.post<ProcessingActivitySummary>(path(org, 'processing'), body),
    'processing',
  )

export const useUpdateProcessing = (org: string, id: string) =>
  useWrite(
    org,
    (body: ProcessingActivityInput & { ifVersion: number }) =>
      api.patch<ProcessingActivitySummary>(path(org, 'processing', `/${id}`), body),
    'processing',
  )

export const useDeleteProcessing = (org: string, id: string) =>
  useWrite(org, () => api.delete<undefined>(path(org, 'processing', `/${id}`)))

// ---------------------------------------------------------------------------
// Impact assessments
// ---------------------------------------------------------------------------

export const usePias = (org: string, query: ListQuery) => useList<PiaSummary>(org, 'pias', query)

export const usePia = (org: string, id: string, fresh = false) =>
  useDetail<PiaSummary>(org, 'pias', id, fresh)

export const useCreatePia = (org: string) =>
  useWrite(org, (body: CreatePiaRequest) => api.post<PiaSummary>(path(org, 'pias'), body), 'pias')

export const useUpdatePia = (org: string, id: string) =>
  useWrite(
    org,
    (body: UpdatePiaRequest) => api.patch<PiaSummary>(path(org, 'pias', `/${id}`), body),
    'pias',
  )

export const useSignOffPia = (org: string, id: string) =>
  useWrite(
    org,
    (body: SignOffPiaRequest) => api.post<PiaSummary>(path(org, 'pias', `/${id}/sign-off`), body),
    'pias',
  )

export const useDeletePia = (org: string, id: string) =>
  useWrite(org, () => api.delete<undefined>(path(org, 'pias', `/${id}`)))

// ---------------------------------------------------------------------------
// Data subject requests
// ---------------------------------------------------------------------------

export const useDsrs = (org: string, query: ListQuery) => useList<DsrSummary>(org, 'dsrs', query)

export const useDsr = (org: string, id: string) => useDetail<DsrDetail>(org, 'dsrs', id)

export const useCreateDsr = (org: string) =>
  useWrite(org, (body: CreateDsrRequest) => api.post<DsrDetail>(path(org, 'dsrs'), body), 'dsrs')

export const useUpdateDsr = (org: string, id: string) =>
  useWrite(
    org,
    (body: UpdateDsrRequest) => api.patch<DsrDetail>(path(org, 'dsrs', `/${id}`), body),
    'dsrs',
  )

export const useDsrTransition = (org: string, id: string) =>
  useWrite(
    org,
    (body: DsrTransitionRequest) =>
      api.post<DsrDetail>(path(org, 'dsrs', `/${id}/transition`), body),
    'dsrs',
  )

export const useAttachDsrFile = (org: string, id: string) =>
  useWrite(
    org,
    (fileId: string) => api.post<DsrDetail>(path(org, 'dsrs', `/${id}/files`), { fileId }),
    'dsrs',
  )

export const useRemoveDsrFile = (org: string, id: string) =>
  useWrite(
    org,
    (fileId: string) => api.delete<DsrDetail>(path(org, 'dsrs', `/${id}/files/${fileId}`)),
    'dsrs',
  )

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export const useIncidents = (org: string, query: ListQuery) =>
  useList<IncidentSummary>(org, 'incidents', query)

export const useIncident = (org: string, id: string) =>
  useDetail<IncidentSummary>(org, 'incidents', id)

export const useReportIncident = (org: string) =>
  useWrite(org, (body: ReportIncidentRequest) =>
    api.post<IncidentReceipt>(path(org, 'incidents'), body),
  )

export const useUpdateIncident = (org: string, id: string) =>
  useWrite(
    org,
    (body: UpdateIncidentRequest) =>
      api.patch<IncidentSummary>(path(org, 'incidents', `/${id}`), body),
    'incidents',
  )

export const useDraftNotices = (org: string, id: string) =>
  useWrite(
    org,
    (ifVersion: number) =>
      api.post<IncidentSummary>(path(org, 'incidents', `/${id}/notices/draft`), { ifVersion }),
    'incidents',
  )

export const useUpdateNotices = (org: string, id: string) =>
  useWrite(
    org,
    (body: UpdateNoticesRequest) =>
      api.patch<IncidentSummary>(path(org, 'incidents', `/${id}/notices`), body),
    'incidents',
  )

export const useSignOffNotices = (org: string, id: string) =>
  useWrite(
    org,
    (ifVersion: number) =>
      api.post<IncidentSummary>(path(org, 'incidents', `/${id}/notices/sign-off`), { ifVersion }),
    'incidents',
  )

export const useRecordNotification = (org: string, id: string) =>
  useWrite(
    org,
    (body: RecordNotificationRequest) =>
      api.post<IncidentSummary>(path(org, 'incidents', `/${id}/notifications`), body),
    'incidents',
  )

export const useCreateRisk = (org: string) =>
  useWrite(org, (body: CreateRiskRequest) => api.post<Risk>(orgPath(org, '/risks'), body))

// ---------------------------------------------------------------------------
// Agreements, registration, training
// ---------------------------------------------------------------------------

export const useAgreements = (org: string, query: ListQuery) =>
  useList<AgreementSummary>(org, 'agreements', query)

export const useAgreement = (org: string, id: string, fresh = false) =>
  useDetail<AgreementSummary>(org, 'agreements', id, fresh)

export const useCreateAgreement = (org: string) =>
  useWrite(
    org,
    (body: AgreementInput) => api.post<AgreementSummary>(path(org, 'agreements'), body),
    'agreements',
  )

export const useUpdateAgreement = (org: string, id: string) =>
  useWrite(
    org,
    (body: AgreementInput & { ifVersion: number }) =>
      api.patch<AgreementSummary>(path(org, 'agreements', `/${id}`), body),
    'agreements',
  )

export const useDeleteAgreement = (org: string, id: string) =>
  useWrite(org, () => api.delete<undefined>(path(org, 'agreements', `/${id}`)))

export const useRegistrations = (org: string) =>
  useList<RegistrationSummary>(org, 'registrations', { pageSize: 10 })

export const useSaveRegistration = (org: string, id: string | null) =>
  useWrite(org, (body: RegistrationInput & { ifVersion?: number }) =>
    id
      ? api.patch<RegistrationSummary>(path(org, 'registrations', `/${id}`), body)
      : api.post<RegistrationSummary>(path(org, 'registrations'), body),
  )

export const useTrainingRecords = (org: string) =>
  useList<TrainingRecordSummary>(org, 'training', { pageSize: 200 })

export const useSaveTraining = (org: string) =>
  useWrite(org, ({ id, ...body }: TrainingRecordInput & { id?: string; ifVersion?: number }) =>
    id
      ? api.patch<TrainingRecordSummary>(path(org, 'training', `/${id}`), body)
      : api.post<TrainingRecordSummary>(path(org, 'training'), body),
  )

export const useDeleteTraining = (org: string) =>
  useWrite(org, (id: string) => api.delete<undefined>(path(org, 'training', `/${id}`)))

// ---------------------------------------------------------------------------
// Links and masked values
// ---------------------------------------------------------------------------

export function useLinks(org: string, type: RecordType, id: string) {
  return useQuery({
    queryKey: qk.privacy.links(org, type, id),
    queryFn: ({ signal }) =>
      api.get<LinksResponse>(orgPath(org, '/links'), { query: { type, id }, signal }),
  })
}

/** Records of `type` to link; `forRecord` leaves out those already linked to it. */
export function useLinkCandidates(
  org: string,
  type: RecordType,
  forRecord: { type: RecordType; id: string } | null,
  q: string,
  enabled: boolean,
) {
  const forKey = forRecord ? `${forRecord.type}:${forRecord.id}` : ''
  return useQuery({
    queryKey: qk.privacy.candidates(org, type, forKey, q),
    queryFn: ({ signal }) =>
      api.get<{ items: RecordRef[] }>(orgPath(org, '/links/candidates'), {
        query: { type, q, for: forKey || undefined },
        signal,
      }),
    select: (d) => d.items,
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Resolves record IDs to refs (ID chip + title) for display. */
export function useRecordRefs(org: string, type: RecordType, ids: string[]) {
  const key = [...ids].sort().join(',')
  return useQuery({
    queryKey: qk.privacy.candidates(org, type, `ids:${key}`, ''),
    queryFn: ({ signal }) =>
      api.get<{ items: RecordRef[] }>(orgPath(org, '/links/candidates'), {
        query: { type, ids: key },
        signal,
      }),
    select: (d) => d.items,
    enabled: ids.length > 0,
    staleTime: 60_000,
  })
}

export const useAddLink = (org: string) =>
  useWrite(org, (body: LinkRequest) => api.post<undefined>(orgPath(org, '/links'), body))

export const useRemoveLink = (org: string) =>
  useWrite(org, ({ from, to }: LinkRequest) =>
    api.delete<undefined>(orgPath(org, '/links'), {
      query: { fromType: from.type, fromId: from.id, toType: to.type, toId: to.id },
    }),
  )

/** Reveal is audited server-side; the value is kept in component state only, never cached. */
export function useReveal(org: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: RevealRequest) =>
      api.post<RevealResponse>(orgPath(org, '/sensitive/reveal'), body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [org, 'audit-events'] }),
  })
}
