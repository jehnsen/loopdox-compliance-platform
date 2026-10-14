import { describe, expect, it } from 'vitest'
import {
  addMonthsToDate,
  daysUntil,
  formatDate,
  formatDateTime,
  formatRelative,
  startOfDayInTz,
  todayInTz,
} from '@/lib/utils/dates'

describe('dates (stored UTC, shown in tenant timezone)', () => {
  it('formats absolute dates as "14 Oct 2026" in Asia/Manila', () => {
    // 20:30 UTC on the 13th is 04:30 on the 14th in Manila (UTC+8).
    expect(formatDate('2026-10-13T20:30:00Z', 'Asia/Manila')).toBe('14 Oct 2026')
    expect(formatDate('2026-10-13T20:30:00Z', 'UTC')).toBe('13 Oct 2026')
    expect(formatDateTime('2026-10-13T20:30:00Z', 'Asia/Manila')).toBe('14 Oct 2026, 04:30')
  })

  it('formats recent times relatively and old ones absolutely', () => {
    const now = new Date('2026-10-14T12:00:00Z')
    expect(formatRelative('2026-10-14T11:59:40Z', now)).toBe('just now')
    expect(formatRelative('2026-10-14T09:00:00Z', now)).toBe('3 h ago')
    expect(formatRelative('2026-10-14T11:15:00Z', now)).toBe('45 min ago')
    expect(formatRelative('2026-10-12T12:00:00Z', now)).toBe('2 d ago')
    expect(formatRelative('2026-10-14T15:00:00Z', now)).toBe('in 3 h')
    expect(formatRelative('2026-09-01T00:00:00Z', now, 'Asia/Manila')).toBe('1 Sep 2026')
  })

  it('computes today and day differences in the tenant timezone', () => {
    const now = new Date('2026-10-13T17:00:00Z') // 01:00 on the 14th in Manila
    expect(todayInTz('Asia/Manila', now)).toBe('2026-10-14')
    expect(todayInTz('UTC', now)).toBe('2026-10-13')
    expect(daysUntil('2026-10-16', 'Asia/Manila', now)).toBe(2)
    expect(daysUntil('2026-10-10', 'Asia/Manila', now)).toBe(-4)
  })

  it('adds calendar months and resolves start of day', () => {
    expect(addMonthsToDate('2026-10-14', 12)).toBe('2027-10-14')
    expect(addMonthsToDate('2026-08-31', 6)).toBe('2027-02-28')
    expect(startOfDayInTz('2026-10-14', 'Asia/Manila')).toBe('2026-10-13T16:00:00.000Z')
  })
})
