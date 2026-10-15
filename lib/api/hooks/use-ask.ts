'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { api, ApiError, isApiError, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import { streamAsk } from '@/lib/api/sse'
import type {
  AskFeedbackRequest,
  AskMessage,
  AskRequest,
  AskRoute,
  AskThread,
  AskThreadDetail,
  Citation,
  ListResponse,
  MeResponse,
} from '@/lib/api/types'

export function useAskThreads(org: string, enabled = true) {
  return useQuery({
    queryKey: qk.ask.threads(org),
    queryFn: ({ signal }) =>
      api.get<ListResponse<AskThread>>(orgPath(org, '/ask/threads'), {
        query: { pageSize: 100 },
        signal,
      }),
    select: (d) => d.items,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useAskThread(org: string, id: string | null) {
  return useQuery({
    queryKey: qk.ask.thread(org, id ?? ''),
    queryFn: ({ signal }) =>
      api.get<AskThreadDetail>(orgPath(org, `/ask/threads/${id}`), { signal }),
    enabled: Boolean(id),
  })
}

export function useDeleteAskThread(org: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<undefined>(orgPath(org, `/ask/threads/${id}`)),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: qk.ask.thread(org, id) })
      void qc.invalidateQueries({ queryKey: qk.ask.threads(org) })
    },
  })
}

export function useAskFeedback(org: string, threadId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, ...body }: AskFeedbackRequest & { messageId: string }) =>
      api.post<AskMessage>(orgPath(org, `/ask/messages/${messageId}/feedback`), body),
    onSuccess: (msg) =>
      qc.setQueryData<AskThreadDetail>(qk.ask.thread(org, threadId), (old) =>
        old ? { ...old, messages: old.messages.map((m) => (m.id === msg.id ? msg : m)) } : old,
      ),
  })
}

/** The answer being streamed, shown under its question until it's saved to the thread. */
export interface PendingAnswer {
  question: string
  route: AskRoute | null
  asOf: string | null
  content: string
  citations: Citation[]
  status: 'streaming' | 'error'
  error: ApiError | null
}

/**
 * Sends a question and follows the SSE stream. Tokens and citations update
 * `pending` as they arrive; on `done` the turn is written into the thread's cache
 * and `pending` clears.
 */
export function useAskStream(org: string, onDone?: (threadId: string) => void) {
  const qc = useQueryClient()
  const [pending, setPending] = useState<PendingAnswer | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Latest callback, so `send` stays stable across renders.
  const onDoneRef = useRef(onDone)
  useLayoutEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  const send = useCallback(
    async (request: AskRequest) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      let content = ''
      let route: AskRoute | null = request.route ?? null
      const citations: Citation[] = []
      const base = {
        question: request.question,
        asOf: request.asOf ?? null,
        status: 'streaming' as const,
        error: null,
      }
      setPending({ ...base, route, content, citations: [] })
      try {
        await streamAsk(
          org,
          request,
          (e) => {
            if (e.event === 'error') throw new ApiError(500, e.data.code, e.data.message)
            if (e.event === 'route') route = e.data.route
            else if (e.event === 'token') content += e.data.text
            else if (e.event === 'citation') citations.push(e.data)
            else {
              const { threadId, messageId, userMessageId, grounded, suggestions, usage } = e.data
              const now = new Date().toISOString()
              const common = {
                threadId,
                asOf: request.asOf ?? null,
                feedback: null,
                createdAt: now,
              }
              const asked: AskMessage = {
                ...common,
                id: userMessageId,
                role: 'user',
                content: request.question,
                citations: [],
                route: null,
                grounded: true,
                suggestions: [],
              }
              const reply: AskMessage = {
                ...common,
                id: messageId,
                role: 'assistant',
                content,
                citations: [...citations],
                route,
                grounded,
                suggestions,
              }
              qc.setQueryData<AskThreadDetail>(qk.ask.thread(org, threadId), (old) =>
                old
                  ? {
                      ...old,
                      updatedAt: now,
                      messageCount: old.messageCount + 2,
                      messages: [...old.messages, asked, reply],
                    }
                  : {
                      id: threadId,
                      orgId: '',
                      userId: '',
                      title: request.question.slice(0, 80),
                      createdAt: now,
                      updatedAt: now,
                      messageCount: 2,
                      messages: [asked, reply],
                    },
              )
              qc.setQueryData<MeResponse>(qk.me(org), (me) =>
                me?.usage ? { ...me, usage: { ...me.usage, askQuestions: usage } } : me,
              )
              void qc.invalidateQueries({ queryKey: qk.ask.threads(org) })
              setPending(null)
              onDoneRef.current?.(threadId)
              return
            }
            setPending({ ...base, route, content, citations: [...citations] })
          },
          controller.signal,
        )
      } catch (err) {
        if (controller.signal.aborted) {
          setPending(null)
          return
        }
        const error = isApiError(err)
          ? err
          : new ApiError(
              0,
              'network_error',
              'The answer stopped because the connection dropped. Ask again.',
            )
        // A plan limit means /me's meter is stale: refresh it so the composer can show the upgrade card.
        if (error.code === 'plan_limit_reached') void qc.invalidateQueries({ queryKey: qk.me(org) })
        setPending({ ...base, route, content, citations: [...citations], status: 'error', error })
      }
    },
    [org, qc],
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])
  const dismiss = useCallback(() => setPending(null), [])

  return { send, stop, dismiss, pending, streaming: pending?.status === 'streaming' }
}
