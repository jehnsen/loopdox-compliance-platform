'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, downloadFile, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type {
  ListQuery,
  ListResponse,
  Questionnaire,
  QuestionnaireRowResult,
  QuestionnaireRowUpdate,
  QuestionnaireSummary,
} from '@/lib/api/types'

const path = (org: string, p = '') => orgPath(org, `/questionnaires${p}`)

export function useQuestionnaires(org: string, query: ListQuery) {
  return useQuery({
    queryKey: qk.questionnaires.list(org, query),
    queryFn: ({ signal }) =>
      api.get<ListResponse<QuestionnaireSummary>>(path(org), { query, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useQuestionnaire(org: string, id: string) {
  return useQuery({
    queryKey: qk.questionnaires.detail(org, id),
    queryFn: ({ signal }) => api.get<Questionnaire>(path(org, `/${id}`), { signal }),
  })
}

export function useMapQuestionnaire(org: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      ifVersion: number
      questionColumn: number
      answerColumn: number | null
    }) => api.post<Questionnaire>(path(org, `/${id}/mapping`), body),
    onSuccess: (q) => {
      qc.setQueryData(qk.questionnaires.detail(org, id), q)
      void qc.invalidateQueries({ queryKey: qk.questionnaires.all(org) })
    },
  })
}

/** Saves one row and patches it into the cached questionnaire (no refetch of every row). */
export function useUpdateQuestionnaireRow(org: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ rowId, ...body }: QuestionnaireRowUpdate & { rowId: string }) =>
      api.patch<QuestionnaireRowResult>(path(org, `/${id}/rows/${rowId}`), body),
    onSuccess: ({ questionnaireStatus, progress, ...row }) => {
      qc.setQueryData<Questionnaire>(qk.questionnaires.detail(org, id), (old) =>
        old
          ? {
              ...old,
              status: questionnaireStatus,
              progress,
              rows: old.rows.map((r) => (r.id === row.id ? row : r)),
            }
          : old,
      )
      void qc.invalidateQueries({ queryKey: [org, 'questionnaires', 'list'] })
    },
  })
}

export function useDeleteQuestionnaire(org: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<undefined>(path(org, `/${id}`)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.questionnaires.all(org) }),
  })
}

export function exportQuestionnaire(org: string, id: string): Promise<void> {
  return downloadFile(path(org, `/${id}/export`), undefined, { method: 'POST' })
}
