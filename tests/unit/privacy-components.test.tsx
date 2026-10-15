import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CountdownClock } from '@/components/countdown-clock'
import { RiskMatrix, ScoreBadge } from '@/components/risk-matrix'
import { REVEAL_SECONDS, SensitiveValueView } from '@/components/sensitive-value'
import { maskContact, maskName } from '@/lib/privacy'
import { overallScore, scoreBand } from '@/lib/risk'

const HOUR = 3_600_000
const DISCOVERED = '2026-10-14T08:00:00.000Z'
const DEADLINE = '2026-10-17T08:00:00.000Z'
const at = (msLeft: number) => new Date(Date.parse(DEADLINE) - msLeft)

describe('CountdownClock', () => {
  const clock = (props: Partial<Parameters<typeof CountdownClock>[0]> & { now: Date }) =>
    render(
      <CountdownClock
        deadline={DEADLINE}
        discoveredAt={DISCOVERED}
        timezone="Asia/Manila"
        {...props}
      />,
    )

  it('shows days, hours and minutes, with a label as well as a colour', () => {
    clock({ now: at(41 * HOUR + 32 * 60_000) })
    const el = screen.getByTestId('countdown-clock')
    expect(el).toHaveAttribute('data-tone', 'neutral')
    expect(screen.getByRole('timer')).toHaveAccessibleName('1 d 17 h 32 min left to notify the NPC')
    expect(screen.getByTestId('countdown-status')).toHaveTextContent('On track')
    expect(el).toHaveTextContent('Due 17 Oct 2026, 16:00 (GMT+8)')
  })

  it('turns amber under 24 h and red under 6 h and after expiry', () => {
    const { unmount } = clock({ now: at(23 * HOUR) })
    expect(screen.getByTestId('countdown-clock')).toHaveAttribute('data-tone', 'warn')
    expect(screen.getByTestId('countdown-status')).toHaveTextContent('Under 24 hours')
    unmount()
    const r2 = clock({ now: at(5 * HOUR) })
    expect(screen.getByTestId('countdown-clock')).toHaveAttribute('data-tone', 'bad')
    r2.unmount()
    clock({ now: at(-3 * HOUR) })
    expect(screen.getByTestId('countdown-clock')).toHaveAttribute('data-phase', 'expired')
    expect(screen.getByRole('timer')).toHaveTextContent('Deadline passed 3 h ago')
  })

  it('prompts for a decision while notification is undecided', () => {
    clock({
      now: at(30 * HOUR),
      notificationRequired: null,
      decideAction: <button>Go to triage</button>,
    })
    expect(screen.getByText('Decide whether notification is required')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to triage' })).toBeInTheDocument()
  })

  it('stops once the NPC notification is recorded', () => {
    clock({
      now: at(-10 * HOUR),
      notificationRequired: true,
      notifiedAt: '2026-10-16T02:00:00.000Z',
    })
    expect(screen.getByTestId('countdown-clock')).toHaveAttribute('data-phase', 'notified')
    expect(screen.getByRole('timer')).toHaveTextContent('Notified at 16 Oct 2026, 10:00 (GMT+8)')
    expect(screen.queryByText('Decide whether notification is required')).not.toBeInTheDocument()
  })
})

describe('SensitiveValueView', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('reveals for 30 seconds, then masks again', async () => {
    const onReveal = vi.fn().mockResolvedValue('mcdelacruz@mail.example')
    render(
      <SensitiveValueView
        masked="m••••@mail.example"
        label="requester contact"
        canReveal
        onReveal={onReveal}
      />,
    )
    expect(screen.getByTestId('sensitive-value')).toHaveTextContent('m••••@mail.example')
    await act(async () => {
      screen.getByRole('button', { name: 'Reveal requester contact' }).click()
    })
    expect(onReveal).toHaveBeenCalledOnce()
    expect(screen.getByTestId('sensitive-value')).toHaveTextContent('mcdelacruz@mail.example')
    expect(screen.getByText(`Hides in ${REVEAL_SECONDS} s`)).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime((REVEAL_SECONDS - 1) * 1000)
    })
    expect(screen.getByTestId('sensitive-value')).toHaveTextContent('mcdelacruz@mail.example')
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByTestId('sensitive-value')).toHaveTextContent('m••••@mail.example')
    expect(screen.getByRole('button', { name: 'Reveal requester contact' })).toBeInTheDocument()
  })

  it('can be hidden early, and shows no Reveal button without permission', async () => {
    const { unmount } = render(
      <SensitiveValueView
        masked="•••• 0142"
        label="contact"
        canReveal
        onReveal={() => Promise.resolve('+639175550142')}
      />,
    )
    await act(async () => {
      screen.getByRole('button', { name: 'Reveal contact' }).click()
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Hide contact' }).click()
    })
    expect(screen.getByTestId('sensitive-value')).toHaveTextContent('•••• 0142')
    unmount()
    render(
      <SensitiveValueView
        masked="•••• 0142"
        label="contact"
        canReveal={false}
        onReveal={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Masked')).toBeInTheDocument()
  })
})

describe('masking and risk scoring', () => {
  it('masks names and contacts', () => {
    expect(maskName('Maria Clara Dela Cruz')).toBe('M•••• C•••• D•••• C••••')
    expect(maskContact('mcdelacruz@mail.example')).toBe('m••••@mail.example')
    expect(maskContact('+63 917 555 0142')).toBe('•••• 0142')
  })

  it('scores risks on a 5×5 matrix', () => {
    expect(scoreBand(4)).toBe('low')
    expect(scoreBand(9)).toBe('medium')
    expect(scoreBand(16)).toBe('high')
    expect(scoreBand(20)).toBe('critical')
    expect(overallScore([])).toBeNull()
    expect(
      overallScore([
        { likelihood: 2, impact: 5 },
        { likelihood: 4, impact: 3 },
      ]),
    ).toBe(12)
    render(
      <>
        <ScoreBadge score={12} />
        <RiskMatrix risks={[{ likelihood: 4, impact: 3 }]} />
      </>,
    )
    expect(screen.getByText('12 · High')).toBeInTheDocument()
    expect(screen.getByTitle(/Likelihood 4 × impact 3 = 12 \(High\): 1 risk$/)).toHaveTextContent(
      '1',
    )
  })
})
