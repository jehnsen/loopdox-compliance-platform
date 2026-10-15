'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircleIcon,
  CopyIcon,
  HistoryIcon,
  LibraryIcon,
  SearchXIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from 'lucide-react'
import { useAskFeedback } from '@/lib/api/hooks/use-ask'
import type { AskMessage, AskRoute, Citation } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { formatCalendarDate } from '@/lib/utils/dates'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { ROUTE_BADGE } from '@/features/ask/meta'

/** Rule: an answer without citations is never shown as fact, whatever text came back. */
export function isGrounded(m: { grounded: boolean; citations: Citation[] }): boolean {
  return m.grounded && m.citations.length > 0
}

function RouteBadge({ route, asOf }: { route: AskRoute | null; asOf: string | null }) {
  const badge = route ? ROUTE_BADGE[route] : null
  if (!badge && !asOf) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {badge ? (
        <span className="flex items-center gap-1">
          <badge.icon className="size-3.5" aria-hidden="true" />
          {badge.label}
        </span>
      ) : null}
      {asOf ? (
        <span className="flex items-center gap-1">
          <HistoryIcon className="size-3.5" aria-hidden="true" />
          As of {formatCalendarDate(asOf)}
        </span>
      ) : null}
    </div>
  )
}

export function NotFoundAnswer({
  suggestions,
  onAsk,
}: {
  suggestions: string[]
  onAsk?: (q: string) => void
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="answer-not-found">
      <p className="flex items-start gap-2 font-medium">
        <SearchXIcon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />I couldn’t
        find this in your approved documents.
      </p>
      <p className="text-sm text-muted">
        Ask only answers from approved policies and the records you can see, and never guesses. Try
        the words a policy would use, or one of these:
      </p>
      {suggestions.length && onAsk ? (
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAsk(s)}
                className="h-auto py-1 text-left whitespace-normal"
              >
                {s}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function copyText(m: Pick<AskMessage, 'content' | 'citations'>): string {
  if (!m.citations.length) return m.content
  const origin = window.location.origin
  const sources = m.citations.map((c) => `[${c.n}] ${c.label} — ${origin}${c.href}`).join('\n')
  return `${m.content}\n\nSources:\n${sources}`
}

function Feedback({ message }: { message: AskMessage }) {
  const org = useOrgSlug()
  const feedback = useAskFeedback(org, message.threadId)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const rating = message.feedback?.rating
  const send = (r: 'up' | 'down', n?: string) =>
    feedback.mutate(
      { messageId: message.id, rating: r, note: n || undefined },
      {
        onSuccess: () => {
          setOpen(false)
          setNote('')
          toast.success('Thanks. Your feedback helps improve Ask.')
        },
        onError: (e) => toastError(e),
      },
    )
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Good answer"
        aria-pressed={rating === 'up'}
        className={cn(rating === 'up' && 'bg-ok-soft text-ok')}
        onClick={() => send('up')}
        disabled={feedback.isPending}
      >
        <ThumbsUpIcon />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Bad answer"
            aria-pressed={rating === 'down'}
            className={cn(rating === 'down' && 'bg-bad-soft text-bad')}
          >
            <ThumbsDownIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-80 flex-col gap-2">
          <Label htmlFor={`fb-${message.id}`}>What was wrong? (optional)</Label>
          <Textarea
            id={`fb-${message.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="For example: it missed the 24-hour client notice"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => send('down', note.trim())}
              disabled={feedback.isPending}
            >
              Send feedback
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}

/** One answer: route, text with numbered citations (or "couldn't find"), and actions. */
export function AnswerView({
  message,
  streaming = false,
  error,
  selected = false,
  onOpenSources,
  onAsk,
}: {
  /** A saved answer, or the one being streamed (no id yet). */
  message: Pick<
    AskMessage,
    'content' | 'citations' | 'route' | 'asOf' | 'grounded' | 'suggestions'
  > &
    Partial<Pick<AskMessage, 'id' | 'feedback' | 'threadId'>>
  streaming?: boolean
  error?: string | null
  selected?: boolean
  onOpenSources?: () => void
  onAsk?: (q: string) => void
}) {
  const grounded = isGrounded(message)
  const saved = message.id && message.threadId ? (message as AskMessage) : null
  return (
    <article
      aria-label="Answer"
      aria-busy={streaming}
      data-testid="answer"
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-surface px-4 py-3',
        selected ? 'border-accent/50' : 'border-line',
      )}
    >
      {grounded || streaming ? <RouteBadge route={message.route} asOf={message.asOf} /> : null}
      {streaming || error ? (
        message.content ? (
          <MarkdownView
            markdown={message.content}
            citations={message.citations}
            className="text-base"
          />
        ) : streaming ? (
          <p className="text-base text-muted">Looking through your approved documents…</p>
        ) : null
      ) : grounded ? (
        <MarkdownView
          markdown={message.content}
          citations={message.citations}
          className="text-base"
        />
      ) : (
        <NotFoundAnswer suggestions={message.suggestions} onAsk={onAsk} />
      )}
      {streaming ? (
        <span
          className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent"
          aria-hidden="true"
        />
      ) : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-bad-soft px-3 py-2 text-sm">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {saved ? (
        <div className="-mb-1 flex flex-wrap items-center gap-1 border-t border-line pt-2">
          {grounded ? (
            <Button variant="ghost" size="sm" onClick={onOpenSources} aria-pressed={selected}>
              <LibraryIcon aria-hidden="true" /> Open sources ({message.citations.length})
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy answer"
            onClick={() =>
              void navigator.clipboard.writeText(copyText(saved)).then(
                () => toast.success(grounded ? 'Copied the answer and its sources' : 'Copied'),
                () => toast.error('Couldn’t copy. Select the text instead.'),
              )
            }
          >
            <CopyIcon />
          </Button>
          <Feedback message={saved} />
        </div>
      ) : null}
    </article>
  )
}
