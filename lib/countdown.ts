import { formatDateTimeZone } from '@/lib/utils/dates'

/**
 * The 72-hour breach notification clock (section 9.3), as pure functions so the
 * thresholds can be unit-tested. The component in components/countdown-clock.tsx
 * only renders what these return.
 */

export const HOUR_MS = 3_600_000
export const NOTIFICATION_WINDOW_HOURS = 72
/** Under this much time left the clock turns amber. */
export const WARN_BELOW_MS = 24 * HOUR_MS
/** Under this much time left (and after expiry) the clock turns red. */
export const BAD_BELOW_MS = 6 * HOUR_MS

/** discoveredAt + 72 hours, as an ISO UTC timestamp. Timezones don't matter: it's elapsed time. */
export function notificationDeadline(discoveredAt: string): string {
  return new Date(Date.parse(discoveredAt) + NOTIFICATION_WINDOW_HOURS * HOUR_MS).toISOString()
}

export type CountdownTone = 'neutral' | 'warn' | 'bad'

export type CountdownPhase =
  /** Counting down, notification still to be decided or sent. */
  | 'running'
  /** The deadline passed without an NPC notification. */
  | 'expired'
  /** NPC notification recorded: the clock is stopped. */
  | 'notified'
  /** Triage decided no notification is required: the clock is stopped. */
  | 'not_required'

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
}

export interface CountdownState {
  phase: CountdownPhase
  tone: CountdownTone
  /** Milliseconds to the deadline; negative once it has passed. */
  remainingMs: number
  /** Whole days/hours/minutes left (zeros once expired). */
  parts: CountdownParts
  /** Short status label shown next to the clock, so it reads without colour. */
  label: string
  /** Main line: "1 d 17 h 32 min left", "Deadline passed 3 h ago", "Notified at …". */
  text: string
  /** The deadline in the tenant timezone: "17 Oct 2026, 16:00 (GMT+8)". */
  deadlineText: string
}

export function splitDuration(ms: number): CountdownParts {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000)
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor(totalMinutes / 60) % 24,
    minutes: totalMinutes % 60,
  }
}

/** "1 d 17 h 32 min", "5 h 0 min", "42 min", "less than 1 min". */
export function formatRemaining(ms: number): string {
  const { days, hours, minutes } = splitDuration(ms)
  if (days > 0) return `${days} d ${hours} h ${minutes} min`
  if (hours > 0) return `${hours} h ${minutes} min`
  if (minutes > 0) return `${minutes} min`
  return 'less than 1 min'
}

/** Coarse elapsed time for "passed … ago": "just now", "42 min", "3 h", "2 d 5 h". */
export function formatElapsed(ms: number): string {
  const { days, hours, minutes } = splitDuration(ms)
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`
  if (hours > 0) return `${hours} h`
  if (minutes > 0) return `${minutes} min`
  return 'less than 1 min'
}

/** Tone for a running clock: neutral above 24 h, amber under 24 h, red under 6 h and after expiry. */
export function toneFor(remainingMs: number): CountdownTone {
  if (remainingMs < BAD_BELOW_MS) return 'bad'
  if (remainingMs < WARN_BELOW_MS) return 'warn'
  return 'neutral'
}

export interface CountdownInput {
  /** ISO UTC deadline (discoveredAt + 72 h). */
  deadline: string
  now: Date
  /** Tenant timezone, for display only. */
  timezone: string
  /** When the NPC notification was recorded; stops the clock. */
  notifiedAt?: string | null
  /** false stops the clock as "not required"; null means not decided yet. */
  notificationRequired?: boolean | null
}

export function countdownState({
  deadline,
  now,
  timezone,
  notifiedAt = null,
  notificationRequired = null,
}: CountdownInput): CountdownState {
  const deadlineMs = Date.parse(deadline)
  const deadlineText = formatDateTimeZone(deadline, timezone)

  if (notifiedAt) {
    const late = Date.parse(notifiedAt) - deadlineMs
    return {
      phase: 'notified',
      tone: 'neutral',
      remainingMs: deadlineMs - Date.parse(notifiedAt),
      parts: splitDuration(0),
      label: late > 0 ? 'Notified late' : 'Notified',
      text:
        `Notified at ${formatDateTimeZone(notifiedAt, timezone)}` +
        (late > 0
          ? `, ${formatElapsed(late)} after the deadline`
          : `, ${formatElapsed(-late)} before the deadline`),
      deadlineText,
    }
  }

  const remainingMs = deadlineMs - now.getTime()

  if (notificationRequired === false) {
    return {
      phase: 'not_required',
      tone: 'neutral',
      remainingMs,
      parts: splitDuration(0),
      label: 'Not required',
      text: 'Notification not required',
      deadlineText,
    }
  }

  if (remainingMs <= 0) {
    const elapsed = -remainingMs
    return {
      phase: 'expired',
      tone: 'bad',
      remainingMs,
      parts: splitDuration(0),
      label: 'Deadline passed',
      text:
        elapsed < 60_000
          ? 'Deadline passed just now'
          : `Deadline passed ${formatElapsed(elapsed)} ago`,
      deadlineText,
    }
  }

  const tone = toneFor(remainingMs)
  return {
    phase: 'running',
    tone,
    remainingMs,
    parts: splitDuration(remainingMs),
    label: tone === 'bad' ? 'Under 6 hours' : tone === 'warn' ? 'Under 24 hours' : 'On track',
    text: `${formatRemaining(remainingMs)} left`,
    deadlineText,
  }
}
