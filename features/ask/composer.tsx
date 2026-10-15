'use client'

import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  HistoryIcon,
  LockIcon,
  SendHorizontalIcon,
  ShieldCheckIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react'
import type { AskRoute } from '@/lib/api/types'
import { isAuditorOnly } from '@/lib/auth/permissions'
import { hasFeature, minimumTierFor, TIER_LABELS } from '@/lib/entitlements'
import { ASK_MAX_QUESTION } from '@/lib/schemas/ask'
import { cn } from '@/lib/utils/cn'
import { formatCalendarDate, todayInTz } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { UpgradeCard } from '@/components/upgrade-card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ROUTES } from '@/features/ask/meta'

export interface ComposerValue {
  question: string
  route: AskRoute | null
  asOf: string | null
}

function UsageMeter() {
  const { usage, tier } = useSession()
  const meter = usage?.askQuestions
  if (!meter || meter.limit === null) return null
  const pct = Math.min(100, Math.round((meter.used / meter.limit) * 100))
  return (
    <div className="flex items-center gap-2 text-xs text-muted" data-testid="ask-meter">
      <Progress
        value={pct}
        className="h-1.5 w-24"
        aria-label={`${meter.used} of ${meter.limit} questions used this month`}
        indicatorClassName={pct >= 90 ? 'bg-warn' : undefined}
      />
      <span className="tabular-nums">
        {meter.used} of {meter.limit} questions this month ({TIER_LABELS[tier]} plan)
      </span>
    </div>
  )
}

/** Has the org used every question its plan allows this month? */
export function useAskCapped(): boolean {
  const meter = useSession().usage?.askQuestions
  return Boolean(meter && meter.limit !== null && meter.used >= meter.limit)
}

export function Composer({
  onSubmit,
  streaming,
  onStop,
  compact = false,
  autoFocus = false,
}: {
  onSubmit: (value: ComposerValue) => void
  streaming: boolean
  onStop: () => void
  compact?: boolean
  autoFocus?: boolean
}) {
  const { tier, roles, org, usage } = useSession()
  const id = useId()
  const [question, setQuestion] = useState('')
  const [route, setRoute] = useState<AskRoute | null>(null)
  const [asOf, setAsOf] = useState<string | null>(null)
  const [showDate, setShowDate] = useState(false)
  const capped = useAskCapped()
  const auditor = isAuditorOnly({ roles })
  const today = todayInTz(org.timezone)

  if (capped) {
    const limit = usage?.askQuestions.limit ?? 0
    return (
      <div className="flex flex-col gap-3" data-testid="ask-capped">
        <p className="text-center text-sm">
          You’ve used all {limit} questions this month on the {TIER_LABELS[tier]} plan. The count
          resets on the 1st.
        </p>
        <UpgradeCard feature="ask.policy" />
      </div>
    )
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const q = question.trim()
    if (q.length < 3 || streaming) return
    onSubmit({ question: q, route, asOf })
    setQuestion('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  // Auto plus each route; routes outside the plan stay visible but locked.
  const chips: {
    value: AskRoute | null
    label: string
    hint: string
    lockedPlan: string | null
  }[] = [
    {
      value: null,
      label: 'Auto',
      hint: 'Choose the best source for each question',
      lockedPlan: null,
    },
    ...ROUTES.filter((r) => !(auditor && r.value === 'impact')).map((r) => ({
      value: r.value,
      label: r.label,
      hint: r.hint,
      lockedPlan: hasFeature(tier, r.feature) ? null : TIER_LABELS[minimumTierFor(r.feature)],
    })),
  ]

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label="Ask a question">
      <div className="flex flex-col rounded-lg border border-line bg-surface focus-within:border-accent">
        <label htmlFor={`${id}-q`} className="sr-only">
          Your question
        </label>
        <textarea
          id={`${id}-q`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          rows={compact ? 2 : 3}
          maxLength={ASK_MAX_QUESTION}
          // Focus lands here when the page or panel opens, as people expect of a chat box.
          autoFocus={autoFocus}
          placeholder="Ask about your policies or records…"
          className="field-sizing-content max-h-48 min-h-14 w-full resize-none rounded-t-lg bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted"
          aria-describedby={`${id}-hint`}
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-2 py-1.5">
          <div
            role="radiogroup"
            aria-label="Answer from"
            className="flex flex-wrap items-center gap-1"
          >
            <span className="mr-1 text-xs text-muted" aria-hidden="true">
              From
            </span>
            {chips.map((r) => {
              const checked = route === r.value
              return (
                <Tooltip key={r.label}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      aria-disabled={r.lockedPlan ? true : undefined}
                      onClick={() => (r.lockedPlan ? null : setRoute(r.value))}
                      className={cn(
                        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs',
                        checked
                          ? 'border-accent bg-accent-soft font-medium text-fg'
                          : 'border-line text-muted hover:text-fg',
                        r.lockedPlan && 'cursor-not-allowed opacity-70 hover:text-muted',
                      )}
                    >
                      {r.lockedPlan ? <LockIcon className="size-3" aria-hidden="true" /> : null}
                      {r.label}
                      {r.lockedPlan ? (
                        <span className="sr-only"> (included in {r.lockedPlan})</span>
                      ) : null}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {r.lockedPlan ? `Included in the ${r.lockedPlan} plan` : r.hint}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {showDate || asOf ? (
              <span className="flex items-center gap-1">
                <label htmlFor={`${id}-asof`} className="text-xs text-muted">
                  As of
                </label>
                <input
                  id={`${id}-asof`}
                  type="date"
                  max={today}
                  value={asOf ?? ''}
                  onChange={(e) => setAsOf(e.target.value || null)}
                  className="h-6 rounded-md border border-line bg-surface px-1.5 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Answer from today’s versions"
                  onClick={() => {
                    setAsOf(null)
                    setShowDate(false)
                  }}
                >
                  <XIcon />
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDate(true)}
                className="text-muted"
              >
                <HistoryIcon aria-hidden="true" /> As of…
              </Button>
            )}
            {streaming ? (
              <Button type="button" variant="secondary" size="sm" onClick={onStop}>
                <SquareIcon aria-hidden="true" /> Stop
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={question.trim().length < 3}
              >
                <SendHorizontalIcon aria-hidden="true" /> Ask
              </Button>
            )}
          </div>
        </div>
      </div>
      <div
        id={`${id}-hint`}
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
      >
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheckIcon className="size-3.5 text-ok" aria-hidden="true" />
          Protected by VisorShield: personal data is masked before questions reach the AI model.
        </p>
        <UsageMeter />
      </div>
      {asOf ? (
        <p className="text-xs text-muted" role="status">
          Policy answers will come from the versions in force on {formatCalendarDate(asOf)}.
        </p>
      ) : null}
    </form>
  )
}
