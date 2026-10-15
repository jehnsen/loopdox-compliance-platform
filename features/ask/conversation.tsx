'use client'

import { useEffect, useRef } from 'react'
import { MessageSquareTextIcon } from 'lucide-react'
import { useAskStream, useAskThread } from '@/lib/api/hooks/use-ask'
import { useDocumentLookup } from '@/lib/api/hooks/use-documents'
import { useCan } from '@/lib/auth/can'
import type { AskContext, AskMessage } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug } from '@/components/providers/session-provider'
import { useEntitlement } from '@/components/gate'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AnswerView, isGrounded } from '@/features/ask/answer'
import { Composer } from '@/features/ask/composer'
import { suggestionsFor } from '@/features/ask/meta'

function Question({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-end">
      <p className="max-w-[85%] rounded-lg bg-accent-soft px-3 py-2 text-base whitespace-pre-wrap">
        <span className="sr-only">You asked: </span>
        {text}
      </p>
    </div>
  )
}

/** The answer whose sources the panel shows: the chosen one, else the latest grounded one. */
export function selectedAnswer(
  messages: AskMessage[],
  selectedId: string | null,
): AskMessage | null {
  const answers = messages.filter((m) => m.role === 'assistant')
  return answers.find((m) => m.id === selectedId) ?? [...answers].reverse().find(isGrounded) ?? null
}

/**
 * A thread's messages, the answer being streamed, and the composer. Used by the
 * Ask page and the Quick Ask panel.
 */
export function Conversation({
  threadId,
  onThreadCreated,
  context = null,
  compact = false,
  selectedId,
  onSelectSources,
  initialQuestion,
}: {
  threadId: string | null
  onThreadCreated: (id: string) => void
  context?: AskContext | null
  compact?: boolean
  selectedId: string | null
  onSelectSources: (messageId: string) => void
  /** Asked once when the conversation opens (?q=, command palette). */
  initialQuestion?: string | null
}) {
  const org = useOrgSlug()
  const thread = useAskThread(org, threadId)
  const stream = useAskStream(org, (id) => {
    if (id !== threadId) onThreadCreated(id)
  })
  const can = useCan()
  const { enabled: hasPolicies } = useEntitlement('policies')
  const lookup = useDocumentLookup(org, hasPolicies && can('policies.read'))
  const docIds = new Set(
    (lookup.data ?? []).filter((d) => d.status === 'approved').map((d) => d.docId),
  )
  const end = useRef<HTMLDivElement>(null)
  const asked = useRef<string | null>(null)
  const messages = threadId ? (thread.data?.messages ?? []) : []
  const selected = selectedAnswer(messages, selectedId)

  const ask = (
    question: string,
    opts: { route?: null | 'policy' | 'records' | 'impact'; asOf?: string | null } = {},
  ) =>
    void stream.send({
      question,
      threadId,
      route: opts.route ?? null,
      asOf: opts.asOf ?? null,
      context,
    })

  // Ask the initial question once, after mount.
  const { send } = stream
  useEffect(() => {
    if (!initialQuestion || asked.current === initialQuestion) return
    const t = setTimeout(() => {
      asked.current = initialQuestion
      void send({ question: initialQuestion, threadId: null, context })
    }, 0)
    return () => clearTimeout(t)
  }, [initialQuestion, context, send])

  // Keep the latest text in view while it streams.
  const pendingLength = stream.pending?.content.length ?? 0
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, pendingLength])

  const empty = !messages.length && !stream.pending
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', compact ? 'gap-3' : 'gap-4')}>
      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        aria-label="Conversation"
        role="log"
        aria-busy={stream.streaming}
      >
        {threadId && thread.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="ml-auto h-10 w-2/3" />
            <Skeleton className="h-40" />
          </div>
        ) : threadId && thread.isError ? (
          <ErrorState
            title="Couldn’t load this conversation"
            onRetry={() => void thread.refetch()}
          />
        ) : empty ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <MessageSquareTextIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="flex max-w-md flex-col gap-1">
              <h2 className="text-md font-semibold">Ask about your policies and records</h2>
              <p className="text-sm text-muted">
                Answers come only from approved policies and the records you can see. Every
                statement links to its source.
              </p>
            </div>
            <ul className="flex flex-col gap-2" aria-label="Suggested questions">
              {suggestionsFor(context, docIds).map((s) => (
                <li key={s}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-auto py-1.5 whitespace-normal"
                    onClick={() => ask(s)}
                  >
                    {s}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {messages.map((m) =>
          m.role === 'user' ? (
            <Question key={m.id} text={m.content} />
          ) : (
            <AnswerView
              key={m.id}
              message={m}
              selected={selected?.id === m.id}
              onOpenSources={() => onSelectSources(m.id)}
              onAsk={(q) => ask(q)}
            />
          ),
        )}
        {stream.pending ? (
          <>
            <Question text={stream.pending.question} />
            <AnswerView
              message={{ ...stream.pending, grounded: true, suggestions: [] }}
              streaming={stream.streaming}
              error={stream.pending.error?.message ?? null}
            />
            {stream.pending.status === 'error' ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => stream.pending && ask(stream.pending.question)}
                >
                  Ask again
                </Button>
                <Button size="sm" variant="ghost" onClick={stream.dismiss}>
                  Dismiss
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
        <div ref={end} />
      </div>
      <p className="sr-only" aria-live="polite">
        {stream.streaming ? 'Answering…' : messages.length ? 'Answer ready.' : ''}
      </p>
      <Composer
        compact={compact}
        autoFocus
        streaming={stream.streaming}
        onStop={stream.stop}
        onSubmit={(v) => ask(v.question, { route: v.route, asOf: v.asOf })}
      />
    </div>
  )
}
