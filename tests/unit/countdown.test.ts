import { describe, expect, it } from 'vitest'
import {
  countdownState,
  formatElapsed,
  formatRemaining,
  HOUR_MS,
  notificationDeadline,
  toneFor,
} from '@/lib/countdown'

const MIN = 60_000
const DISCOVERED = '2026-10-14T08:00:00.000Z' // 16:00 in Manila
const DEADLINE = '2026-10-17T08:00:00.000Z'

/** Clock state with `ms` left before the deadline. */
function at(
  ms: number,
  tz = 'Asia/Manila',
  extra: Partial<Parameters<typeof countdownState>[0]> = {},
) {
  return countdownState({
    deadline: DEADLINE,
    now: new Date(Date.parse(DEADLINE) - ms),
    timezone: tz,
    ...extra,
  })
}

describe('notificationDeadline', () => {
  it('is discoveredAt + 72 hours of elapsed time', () => {
    expect(notificationDeadline(DISCOVERED)).toBe(DEADLINE)
    // Offsets in the input don't change the instant.
    expect(notificationDeadline('2026-10-14T16:00:00+08:00')).toBe(DEADLINE)
  })

  it('counts elapsed hours across a daylight-saving change, not wall-clock hours', () => {
    // New York falls back on 1 Nov 2026: 72 elapsed hours end at 07:00 local, not 08:00.
    const start = '2026-10-31T12:00:00.000Z' // 08:00 EDT
    const end = notificationDeadline(start)
    expect(Date.parse(end) - Date.parse(start)).toBe(72 * HOUR_MS)
    expect(
      countdownState({ deadline: end, now: new Date(start), timezone: 'America/New_York' })
        .deadlineText,
    ).toMatch(/^3 Nov 2026, 07:00 \(EST\)$/)
  })
})

describe('thresholds: neutral above 24 h, amber under 24 h, red under 6 h and after expiry', () => {
  it.each([
    ['72 h left', 72 * HOUR_MS, 'neutral', 'On track'],
    ['24 h 1 min left', 24 * HOUR_MS + MIN, 'neutral', 'On track'],
    ['exactly 24 h left', 24 * HOUR_MS, 'neutral', 'On track'],
    ['just under 24 h', 24 * HOUR_MS - 1, 'warn', 'Under 24 hours'],
    ['12 h left', 12 * HOUR_MS, 'warn', 'Under 24 hours'],
    ['exactly 6 h left', 6 * HOUR_MS, 'warn', 'Under 24 hours'],
    ['just under 6 h', 6 * HOUR_MS - 1, 'bad', 'Under 6 hours'],
    ['1 min left', MIN, 'bad', 'Under 6 hours'],
  ])('%s → %s', (_name, ms, tone, label) => {
    const s = at(ms)
    expect(s.phase).toBe('running')
    expect(s.tone).toBe(tone)
    expect(s.label).toBe(label)
  })

  it('expires at the deadline and stays red', () => {
    for (const ms of [0, -1, -3 * HOUR_MS, -50 * HOUR_MS]) {
      const s = at(ms)
      expect(s.phase).toBe('expired')
      expect(s.tone).toBe('bad')
      expect(s.label).toBe('Deadline passed')
    }
  })

  it('agrees with toneFor at the boundaries', () => {
    expect(toneFor(24 * HOUR_MS)).toBe('neutral')
    expect(toneFor(24 * HOUR_MS - 1)).toBe('warn')
    expect(toneFor(6 * HOUR_MS - 1)).toBe('bad')
    expect(toneFor(-1)).toBe('bad')
  })
})

describe('text', () => {
  it('shows days, hours and minutes left', () => {
    expect(at(41 * HOUR_MS + 32 * MIN).text).toBe('1 d 17 h 32 min left')
    expect(at(41 * HOUR_MS + 32 * MIN).parts).toEqual({ days: 1, hours: 17, minutes: 32 })
    expect(at(5 * HOUR_MS).text).toBe('5 h 0 min left')
    expect(at(42 * MIN + 59_000).text).toBe('42 min left')
    expect(at(30_000).text).toBe('less than 1 min left')
  })

  it('says how long ago the deadline passed', () => {
    expect(at(-3 * HOUR_MS).text).toBe('Deadline passed 3 h ago')
    expect(at(-3 * HOUR_MS - 59 * MIN).text).toBe('Deadline passed 3 h ago')
    expect(at(-25 * MIN).text).toBe('Deadline passed 25 min ago')
    expect(at(-(2 * 24 + 5) * HOUR_MS).text).toBe('Deadline passed 2 d 5 h ago')
    expect(at(-10_000).text).toBe('Deadline passed just now')
  })

  it('formats durations', () => {
    expect(formatRemaining(72 * HOUR_MS)).toBe('3 d 0 h 0 min')
    expect(formatElapsed(48 * HOUR_MS)).toBe('2 d')
  })
})

describe('stopping the clock', () => {
  it('stops when the NPC notification is recorded, early or late', () => {
    const early = at(10 * HOUR_MS, 'Asia/Manila', { notifiedAt: '2026-10-16T02:00:00.000Z' })
    expect(early.phase).toBe('notified')
    expect(early.tone).toBe('neutral')
    expect(early.label).toBe('Notified')
    expect(early.text).toBe('Notified at 16 Oct 2026, 10:00 (GMT+8), 1 d 6 h before the deadline')

    // Recorded after the deadline: still stopped, but says it was late. "now" no longer matters.
    const late = at(-30 * HOUR_MS, 'Asia/Manila', { notifiedAt: '2026-10-17T11:00:00.000Z' })
    expect(late.phase).toBe('notified')
    expect(late.label).toBe('Notified late')
    expect(late.text).toContain('3 h after the deadline')
  })

  it('stops when triage decides notification is not required', () => {
    const s = at(2 * HOUR_MS, 'Asia/Manila', { notificationRequired: false })
    expect(s.phase).toBe('not_required')
    expect(s.tone).toBe('neutral')
  })

  it('keeps running while notification is undecided', () => {
    expect(at(2 * HOUR_MS, 'Asia/Manila', { notificationRequired: null }).phase).toBe('running')
  })
})

describe('timezones', () => {
  it('shows the same remaining time in every timezone, and the deadline in local time', () => {
    const zones = {
      'Asia/Manila': '17 Oct 2026, 16:00 (GMT+8)',
      UTC: '17 Oct 2026, 08:00 (UTC)',
      'America/Los_Angeles': '17 Oct 2026, 01:00 (PDT)',
      'Pacific/Kiritimati': '17 Oct 2026, 22:00 (GMT+14)',
    }
    for (const [tz, deadlineText] of Object.entries(zones)) {
      const s = at(23 * HOUR_MS, tz)
      expect(s.deadlineText).toBe(deadlineText)
      expect(s.text).toBe('23 h 0 min left')
      expect(s.tone).toBe('warn')
    }
  })

  it('crosses calendar days differently per zone without changing the thresholds', () => {
    // 5 h 59 min left: already the 17th in Manila, still the 16th in Los Angeles.
    const now = new Date(Date.parse(DEADLINE) - (5 * HOUR_MS + 59 * MIN))
    const manila = countdownState({ deadline: DEADLINE, now, timezone: 'Asia/Manila' })
    const la = countdownState({ deadline: DEADLINE, now, timezone: 'America/Los_Angeles' })
    expect(manila.tone).toBe('bad')
    expect(la.tone).toBe('bad')
    expect(manila.remainingMs).toBe(la.remainingMs)
  })
})
