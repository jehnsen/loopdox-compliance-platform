'use client'

import { formatCalendarDate, formatDate, formatDateTime, formatRelative } from '@/lib/utils/dates'
import { useNow } from '@/lib/utils/use-now'
import { useSession } from '@/components/providers/session-provider'

/**
 * Renders a timestamp in the org's timezone. `relative` shows "3 h ago" with the
 * absolute time on hover; otherwise "14 Oct 2026".
 */
export function DateText({
  value,
  relative = false,
  withTime = false,
  className,
}: {
  value: string | null | undefined
  relative?: boolean
  withTime?: boolean
  className?: string
}) {
  const tz = useSession().org.timezone
  // Null until hydrated: relative text is computed on the client only.
  const now = useNow()
  if (!value) return <span className={className}>—</span>
  const absolute = withTime || relative ? formatDateTime(value, tz) : formatDate(value, tz)
  const text = relative && now ? formatRelative(value, now, tz) : absolute
  return (
    <time dateTime={value} title={absolute} className={className}>
      {text}
    </time>
  )
}

/** A calendar date such as an effective or review date: "14 Oct 2026". */
export function CalendarDate({
  value,
  className,
}: {
  value: string | null | undefined
  className?: string
}) {
  if (!value) return <span className={className}>—</span>
  return (
    <time dateTime={value} className={className}>
      {formatCalendarDate(value)}
    </time>
  )
}
