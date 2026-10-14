'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type {
  Acknowledgement,
  AcknowledgementStatus,
  Control,
  CreateDocumentRequest,
  DocumentDetail,
  DocumentLookupItem,
  DocumentSummary,
  DocumentVersion,
  DocumentVersionSummary,
  ListQuery,
  ListResponse,
  UpdateDocumentRequest,
} from '@/lib/api/types'

const docs = (org: string, path = '') => orgPath(org, `/documents${path}`)

export function useDocuments(org: string, query: ListQuery) {
  return useQuery({
    queryKey: qk.documents.list(org, query),
    queryFn: ({ signal }) => api.get<ListResponse<DocumentSummary>>(docs(org), { query, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useDocumentLookup(org: string, enabled = true) {
  return useQuery({
    queryKey: qk.documents.lookup(org),
    queryFn: ({ signal }) => api.get<{ items: DocumentLookupItem[] }>(docs(org, '/lookup'), { signal }),
    select: (d) => d.items,
    staleTime: 60_000,
    enabled,
  })
}

export function useDocument(org: string, id: string) {
  return useQuery({
    queryKey: qk.documents.detail(org, id),
    queryFn: ({ signal }) => api.get<DocumentDetail>(docs(org, `/${encodeURIComponent(id)}`), { signal }),
  })
}

export function useDocumentVersions(org: string, id: string) {
  return useQuery({
    queryKey: qk.documents.versions(org, id),
    queryFn: ({ signal }) =>
      api.get<ListResponse<DocumentVersionSummary>>(docs(org, `/${id}/versions`), {
        query: { pageSize: 200 },
        signal,
      }),
  })
}

export function useDocumentVersion(org: string, id: string, version: number | null) {
  return useQuery({
    queryKey: qk.documents.version(org, id, version ?? 0),
    queryFn: ({ signal }) => api.get<DocumentVersion>(docs(org, `/${id}/versions/${version}`), { signal }),
    enabled: version !== null && version > 0,
    staleTime: Infinity, // versions are immutable
  })
}

export function useAcknowledgements(org: string, id: string, enabled = true) {
  return useQuery({
    queryKey: qk.documents.acknowledgements(org, id),
    queryFn: ({ signal }) => api.get<AcknowledgementStatus>(docs(org, `/${id}/acknowledgements`), { signal }),
    enabled,
  })
}

export function useNextDocId(org: string, enabled = true) {
  return useQuery({
    queryKey: qk.documents.nextId(org),
    queryFn: ({ signal }) => api.get<{ docId: string }>(docs(org, '/next-id'), { signal }),
    enabled,
    staleTime: 0,
  })
}

export function useLinkedControls(org: string, documentId: string, enabled: boolean) {
  const query = { documentId, pageSize: 200 }
  return useQuery({
    queryKey: qk.controls(org, query),
    queryFn: ({ signal }) => api.get<ListResponse<Control>>(orgPath(org, '/controls'), { query, signal }),
    enabled,
  })
}

/** After any document write: refresh everything document-related for this org. */
function useInvalidateDocuments(org: string) {
  const qc = useQueryClient()
  return (detail?: DocumentDetail) => {
    if (detail) {
      qc.setQueryData(qk.documents.detail(org, detail.id), detail)
      qc.setQueryData(qk.documents.detail(org, detail.docId), detail)
    }
    void qc.invalidateQueries({ queryKey: qk.documents.all(org) })
    void qc.invalidateQueries({ queryKey: qk.notifications(org) })
  }
}

export function useCreateDocument(org: string) {
  const done = useInvalidateDocuments(org)
  return useMutation({
    mutationFn: (body: CreateDocumentRequest) => api.post<DocumentDetail>(docs(org), body),
    onSuccess: done,
  })
}

export function useUpdateDocument(org: string, id: string) {
  const done = useInvalidateDocuments(org)
  return useMutation({
    mutationFn: (body: UpdateDocumentRequest) => api.patch<DocumentDetail>(docs(org, `/${id}`), body),
    onSuccess: done,
  })
}

type WorkflowAction = 'submit' | 'approve' | 'reject' | 'retire'

export function useDocumentWorkflow(org: string, id: string) {
  const done = useInvalidateDocuments(org)
  return useMutation({
    mutationFn: ({ action, note, ifVersion }: { action: WorkflowAction; note?: string; ifVersion?: number }) =>
      api.post<DocumentDetail>(docs(org, `/${id}/${action}`), { note: note || undefined, ifVersion }),
    onSuccess: done,
  })
}

export function useRestoreVersion(org: string, id: string) {
  const done = useInvalidateDocuments(org)
  return useMutation({
    mutationFn: (body: { version: number; ifVersion: number; changeSummary?: string }) =>
      api.post<DocumentDetail>(docs(org, `/${id}/restore`), body),
    onSuccess: done,
  })
}

export function useDeleteDocument(org: string, id: string) {
  const done = useInvalidateDocuments(org)
  return useMutation({
    mutationFn: () => api.delete<undefined>(docs(org, `/${id}`)),
    onSuccess: () => done(),
  })
}

export function useAcknowledge(org: string, id: string) {
  const done = useInvalidateDocuments(org)
  return useMutation({
    mutationFn: () => api.post<Acknowledgement>(docs(org, `/${id}/acknowledgements`)),
    onSuccess: () => done(),
  })
}

export function useRemindAcknowledgements(org: string, id: string) {
  return useMutation({
    mutationFn: () => api.post<{ reminded: number }>(docs(org, `/${id}/acknowledgements/remind`)),
  })
}

export function useReorderDocuments(org: string) {
  const done = useInvalidateDocuments(org)
  return useMutation({
    mutationFn: (body: { parentId: string | null; orderedIds: string[] }) =>
      api.post<undefined>(docs(org, '/reorder'), body),
    onSuccess: () => done(),
  })
}
