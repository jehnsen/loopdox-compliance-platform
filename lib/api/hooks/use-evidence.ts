'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, downloadFile, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import { uploadEvidence } from '@/lib/api/upload'
import type {
  AuditPack,
  Connector,
  ConnectorRunResult,
  ConnectorUpdate,
  ControlSummary,
  EvidenceItem,
  EvidenceUploadFields,
  ListQuery,
  ListResponse,
} from '@/lib/api/types'

// ---------------------------------------------------------------------------
// Controls and evidence
// ---------------------------------------------------------------------------

export function useControls(org: string, query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: qk.controls(org, query),
    queryFn: ({ signal }) =>
      api.get<ListResponse<ControlSummary>>(orgPath(org, '/controls'), { query, signal }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useControl(org: string, id: string) {
  return useQuery({
    queryKey: qk.control(org, id),
    queryFn: ({ signal }) =>
      api.get<ControlSummary>(orgPath(org, `/controls/${encodeURIComponent(id)}`), { signal }),
    enabled: Boolean(id),
  })
}

export function useControlEvidence(org: string, id: string) {
  return useQuery({
    queryKey: qk.controlEvidence(org, id),
    queryFn: ({ signal }) =>
      api.get<ListResponse<EvidenceItem>>(
        orgPath(org, `/controls/${encodeURIComponent(id)}/evidence`),
        { query: { pageSize: 100 }, signal },
      ),
    enabled: Boolean(id),
    staleTime: 0,
  })
}

export function useEvidenceList(org: string, query: ListQuery) {
  return useQuery({
    queryKey: qk.evidenceList(org, query),
    queryFn: ({ signal }) =>
      api.get<ListResponse<EvidenceItem>>(orgPath(org, '/evidence'), { query, signal }),
    placeholderData: keepPreviousData,
  })
}

/** Everything an evidence write can change, from the control's status to the dashboard. */
function useRefreshEvidence(org: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [org, 'controls'] })
    void qc.invalidateQueries({ queryKey: qk.connectors(org) })
    void qc.invalidateQueries({ queryKey: [org, 'audit-pack'] })
    void qc.invalidateQueries({ queryKey: qk.overview(org) })
    void qc.invalidateQueries({ queryKey: qk.notifications(org) })
    void qc.invalidateQueries({ queryKey: [org, 'audit-events'] })
    void qc.invalidateQueries({ queryKey: [org, 'search'] })
    // The plan page's connector meter reads /me.
    void qc.invalidateQueries({ queryKey: ['me'] })
  }
}

export interface UploadEvidenceVars {
  fields: EvidenceUploadFields
  file: File
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export function useUploadEvidence(org: string) {
  const refresh = useRefreshEvidence(org)
  return useMutation({
    mutationFn: ({ fields, file, onProgress, signal }: UploadEvidenceVars) =>
      uploadEvidence(org, fields, file, onProgress, signal),
    onSuccess: refresh,
  })
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

export function useConnectors(org: string) {
  return useQuery({
    queryKey: qk.connectors(org),
    queryFn: ({ signal }) =>
      api.get<ListResponse<Connector>>(orgPath(org, '/connectors'), { signal }),
  })
}

export function useUpdateConnector(org: string, id: string) {
  const refresh = useRefreshEvidence(org)
  return useMutation({
    mutationFn: (body: ConnectorUpdate) =>
      api.patch<Connector>(orgPath(org, `/connectors/${encodeURIComponent(id)}`), body),
    onSuccess: refresh,
  })
}

export function useRunConnector(org: string) {
  const refresh = useRefreshEvidence(org)
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ConnectorRunResult>(orgPath(org, `/connectors/${encodeURIComponent(id)}/run`), {}),
    onSuccess: refresh,
  })
}

// ---------------------------------------------------------------------------
// Audit pack
// ---------------------------------------------------------------------------

export interface AuditPackQuery {
  from: string | null
  to: string | null
}

const packQuery = (q: AuditPackQuery): ListQuery => ({
  from: q.from ?? undefined,
  to: q.to ?? undefined,
})

export function useAuditPack(org: string, query: AuditPackQuery) {
  const q = packQuery(query)
  return useQuery({
    queryKey: qk.auditPack(org, q),
    queryFn: ({ signal }) => api.get<AuditPack>(orgPath(org, '/audit-pack'), { query: q, signal }),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}

export function exportAuditPack(org: string, query: AuditPackQuery) {
  return downloadFile(orgPath(org, '/audit-pack/export'), packQuery(query))
}
