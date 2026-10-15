'use client'

import type { ReactNode } from 'react'
import {
  AlarmClockIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleSlashIcon,
  type LucideIcon,
} from 'lucide-react'
import { countdownState, type CountdownPhase, type CountdownTone } from '@/lib/countdown'
import { cn } from '@/lib/utils/cn'
import { formatDateTimeZone } from '@/lib/utils/dates'
import { useNow } from '@/lib/utils/use-now'

const TONE: Record<CountdownTone, { frame: string; digits: string; badge: string }> = {
  neutral: {
    frame: 'border-line border-l-muted bg-surface',
    digits: 'text-fg',
    badge: 'bg-surface-2 text-muted',
  },
  warn: {
    frame: 'border-warn/40 border-l-warn bg-warn-soft',
    digits: 'text-warn',
    badge: 'bg-surface text-warn',
  },
  bad: {
    frame: 'border-bad/40 border-l-bad bg-bad-soft',
    digits: 'text-bad',
    badge: 'bg-surface text-bad',
  },
}

const PHASE_ICON: Record<CountdownPhase, LucideIcon> = {
  running: AlarmClockIcon,
  expired: AlertTriangleIcon,
  notified: CheckCircle2Icon,
  not_required: CircleSlashIcon,
}

function Unit({ value, unit, tone }: { value: number | null; unit: string; tone: CountdownTone }) {
  return (
    <span className="flex items-baseline gap-1">
      <span
        className={cn(
          'text-2xl font-semibold tabular-nums sm:text-[40px] sm:leading-none',
          TONE[tone].digits,
        )}
      >
        {value === null ? '–' : String(value).padStart(2, '0')}
      </span>
      <span className="text-sm text-muted">{unit}</span>
    </span>
  )
}

/** One-line clock for tables: "41 h 12 min left" / "Deadline passed 3 h ago" / "Notified". */
export function CountdownInline({
  deadline,
  notifiedAt = null,
  notificationRequired = null,
  timezone,
}: {
  deadline: string
  notifiedAt?: string | null
  notificationRequired?: boolean | null
  timezone: string
}) {
  const now = useNow()
  if (!now) return <span className="text-muted">…</span>
  const s = countdownState({ deadline, now, timezone, notifiedAt, notificationRequired })
  const Icon = PHASE_ICON[s.phase]
  return (
    <span
      title={`Due ${s.deadlineText}`}
      data-tone={s.tone}
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap tabular-nums',
        s.tone === 'bad' ? 'text-bad' : s.tone === 'warn' ? 'text-warn' : 'text-fg',
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {s.phase === 'notified' ? s.label : s.phase === 'not_required' ? 'Not required' : s.text}
    </span>
  )
}

/**
 * The 72-hour breach notification clock (section 9.3). Shows time left to
 * `deadline` in days, hours and minutes: neutral above 24 h, amber under 24 h,
 * red under 6 h and after expiry. Recording the NPC notification stops it.
 * Status reads from the label and icon as well as colour.
 */
export function CountdownClock({
  deadline,
  discoveredAt,
  notifiedAt = null,
  notificationRequired = null,
  timezone,
  now: nowOverride,
  decideAction,
  className,
}: {
  deadline: string
  discoveredAt: string
  notifiedAt?: string | null
  notificationRequired?: boolean | null
  /** Tenant timezone for the absolute times. */
  timezone: string
  /** Fixed time, for tests; otherwise the shared ticking clock. */
  now?: Date
  /** Shown with the "Decide whether notification is required" prompt. */
  decideAction?: ReactNode
  className?: string
}) {
  const ticking = useNow()
  const now = nowOverride ?? ticking
  // Before hydration there is no "now": render the frame without numbers.
  const state = countdownState({
    deadline,
    now: now ?? new Date(Date.parse(deadline) + 1),
    timezone,
    notifiedAt,
    notificationRequired,
  })
  const hydrated = now !== null
  const tone = hydrated ? state.tone : 'neutral'
  const Icon = PHASE_ICON[state.phase]

  return (
    <section
      aria-labelledby="countdown-title"
      data-testid="countdown-clock"
      data-phase={hydrated ? state.phase : 'loading'}
      data-tone={tone}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-l-4 px-4 py-4 sm:px-5',
        TONE[tone].frame,
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="countdown-title" className="label-caps">
          NPC notification deadline
        </h2>
        {hydrated ? (
          <span
            data-testid="countdown-status"
            className={cn(
              'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
              TONE[tone].badge,
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {state.label}
          </span>
        ) : null}
      </div>

      {state.phase === 'running' || !hydrated ? (
        <div
          role="timer"
          aria-label={hydrated ? `${state.text} to notify the NPC` : 'Loading the deadline'}
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
        >
          <Unit value={hydrated ? state.parts.days : null} unit="d" tone={tone} />
          <Unit value={hydrated ? state.parts.hours : null} unit="h" tone={tone} />
          <Unit value={hydrated ? state.parts.minutes : null} unit="min" tone={tone} />
          <span className="text-sm text-muted">left</span>
        </div>
      ) : (
        <p
          role="timer"
          className={cn('flex items-center gap-2 text-lg font-semibold', TONE[tone].digits)}
        >
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          {state.text}
        </p>
      )}

      <p className="text-sm text-muted">
        Due <span className="font-medium text-fg">{state.deadlineText}</span>, 72 hours after
        discovery on {formatDateTimeZone(discoveredAt, timezone)}.
      </p>

      {hydrated && notificationRequired === null && state.phase !== 'notified' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-3 py-2">
          <p className="flex-1 text-base font-medium">Decide whether notification is required</p>
          {decideAction}
        </div>
      ) : null}
    </section>
  )
}
