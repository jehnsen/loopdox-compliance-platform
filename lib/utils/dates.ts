import { addMonths, differenceInMinutes, formatDistanceStrict, parseISO } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { DEFAULT_TIMEZONE } from '@/lib/config'

/**
 * Dates are stored as ISO 8601 UTC and displayed in the tenant's timezone.
 * Absolute dates read "14 Oct 2026"; recent times read "3 h ago".
 */

type DateInput = string | Date

function toDate(value: DateInput): Date {
  return typeof value === 'string' ? parseISO(value) : value
}

/** "14 Oct 2026" */
export function formatDate(value: DateInput, tz: string = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(toDate(value), tz, 'd MMM yyyy')
}

/** "14 Oct 2026, 09:30" */
export function formatDateTime(value: DateInput, tz: string = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(toDate(value), tz, 'd MMM yyyy, HH:mm')
}

/** "14 Oct 2026, 09:30 PHT" style, with the zone abbreviation for clarity on deadlines. */
export function formatDateTimeZone(value: DateInput, tz: string = DEFAULT_TIMEZONE): string {
  return `${formatDateTime(value, tz)} (${tzAbbreviation(value, tz)})`
}

export function tzAbbreviation(value: DateInput, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'short',
  }).formatToParts(toDate(value))
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz
}

const RECENT_MINUTES = 60 * 24 * 7

/**
 * Relative for recent times ("just now", "3 h ago", "2 d ago"), absolute otherwise.
 * Future times read "in 3 h".
 */
export function formatRelative(
  value: DateInput,
  now: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): string {
  const date = toDate(value)
  const diff = differenceInMinutes(now, date)
  if (Math.abs(diff) > RECENT_MINUTES) return formatDate(date, tz)
  if (Math.abs(diff) < 1) return 'just now'
  const text = formatDistanceStrict(date, now, { roundingMethod: 'floor' })
    .replace(/ minutes?/, ' min')
    .replace(/ hours?/, ' h')
    .replace(/ days?/, ' d')
    .replace(/ seconds?/, ' s')
  return diff > 0 ? `${text} ago` : `in ${text}`
}

/** Today's calendar date in the tenant's timezone: "2026-10-14". */
export function todayInTz(tz: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, 'yyyy-MM-dd')
}

/** Add calendar months to a "yyyy-MM-dd" date. */
export function addMonthsToDate(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const result = addMonths(new Date(Date.UTC(y, m - 1, d)), months)
  return result.toISOString().slice(0, 10)
}

/** Start of a calendar date in the tenant's timezone, as a UTC ISO string. */
export function startOfDayInTz(date: string, tz: string = DEFAULT_TIMEZONE): string {
  return fromZonedTime(`${date}T00:00:00`, tz).toISOString()
}

/** Whole calendar days from today (tenant timezone) to `date`; negative when past. */
export function daysUntil(
  date: string,
  tz: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): number {
  const today = Date.parse(`${todayInTz(tz, now)}T00:00:00Z`)
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00Z`)
  return Math.round((target - today) / 86_400_000)
}

/** "2026-10-14" (a calendar date, no timezone) → "14 Oct 2026". */
export function formatCalendarDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number) as [number, number, number]
  return formatInTimeZone(new Date(Date.UTC(y, m - 1, d, 12)), 'UTC', 'd MMM yyyy')
}

/** ISO UTC → "2026-10-14T16:00", the wall-clock value for a datetime-local input in `tz`. */
export function toZonedInputValue(iso: string, tz: string = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(toDate(iso), tz, "yyyy-MM-dd'T'HH:mm")
}

/** A datetime-local value read as wall-clock time in `tz` → ISO UTC. Null when incomplete. */
export function fromZonedInputValue(value: string, tz: string = DEFAULT_TIMEZONE): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  return fromZonedTime(`${value}:00`, tz).toISOString()
}
