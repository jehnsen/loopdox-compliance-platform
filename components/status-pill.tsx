import { AlertTriangleIcon, CheckIcon, ClockIcon, XIcon } from 'lucide-react'
import type { Severity } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'

export type { Severity }

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'bad'
/** The non-colour cue every pill carries. */
export type Mark = 'hollow' | 'dot' | 'clock' | 'check' | 'x' | 'alert' | 'strike'

export interface StatusStyle {
  label: string
  tone: Tone
  mark: Mark
}

/** Shared status vocabulary. Modules add their own statuses here. */
export const STATUS_STYLES: Record<string, StatusStyle> = {
  draft: { label: 'Draft', tone: 'neutral', mark: 'hollow' },
  in_review: { label: 'In review', tone: 'warn', mark: 'dot' },
  approved: { label: 'Approved', tone: 'ok', mark: 'dot' },
  overdue: { label: 'Overdue', tone: 'bad', mark: 'clock' },
  retired: { label: 'Retired', tone: 'neutral', mark: 'strike' },
  due_soon: { label: 'Due soon', tone: 'warn', mark: 'clock' },
  passing: { label: 'Passing', tone: 'ok', mark: 'check' },
  failing: { label: 'Failing', tone: 'bad', mark: 'x' },
  no_evidence: { label: 'No evidence', tone: 'warn', mark: 'hollow' },
  not_applicable: { label: 'Not applicable', tone: 'neutral', mark: 'strike' },
  connected: { label: 'Connected', tone: 'ok', mark: 'dot' },
  error: { label: 'Error', tone: 'bad', mark: 'alert' },
  disconnected: { label: 'Disconnected', tone: 'neutral', mark: 'hollow' },
  active: { label: 'Active', tone: 'ok', mark: 'dot' },
  review_overdue: { label: 'Review overdue', tone: 'bad', mark: 'clock' },
  review_due_soon: { label: 'Review due soon', tone: 'warn', mark: 'clock' },
  pending: { label: 'Pending', tone: 'warn', mark: 'hollow' },
  edited: { label: 'Edited', tone: 'info', mark: 'dot' },
  needs_input: { label: 'Needs input', tone: 'bad', mark: 'alert' },
  mapping: { label: 'Mapping columns', tone: 'neutral', mark: 'hollow' },
  complete: { label: 'Complete', tone: 'ok', mark: 'check' },
  acknowledged: { label: 'Acknowledged', tone: 'ok', mark: 'check' },
  invited: { label: 'Invited', tone: 'warn', mark: 'hollow' },
  // Privacy (M3)
  signed_off: { label: 'Signed off', tone: 'ok', mark: 'check' },
  in_progress: { label: 'In progress', tone: 'warn', mark: 'dot' },
  received: { label: 'Received', tone: 'info', mark: 'hollow' },
  identity_verified: { label: 'Identity verified', tone: 'info', mark: 'dot' },
  responded: { label: 'Responded', tone: 'ok', mark: 'check' },
  closed: { label: 'Closed', tone: 'neutral', mark: 'check' },
  reported: { label: 'Reported', tone: 'bad', mark: 'alert' },
  triage: { label: 'Triage', tone: 'warn', mark: 'dot' },
  contained: { label: 'Contained', tone: 'info', mark: 'dot' },
  notified: { label: 'Notified', tone: 'ok', mark: 'check' },
  open: { label: 'Open', tone: 'warn', mark: 'dot' },
  registered: { label: 'Registered', tone: 'ok', mark: 'check' },
  renewal_due: { label: 'Renewal due', tone: 'warn', mark: 'clock' },
  expired: { label: 'Expired', tone: 'bad', mark: 'clock' },
  valid: { label: 'Valid', tone: 'ok', mark: 'check' },
  expiring: { label: 'Expiring', tone: 'warn', mark: 'clock' },
  // AI Governance (M8)
  healthy: { label: 'Healthy', tone: 'ok', mark: 'check' },
  degraded: { label: 'Degraded', tone: 'warn', mark: 'alert' },
  proposed: { label: 'Proposed', tone: 'info', mark: 'hollow' },
  rejected: { label: 'Rejected', tone: 'bad', mark: 'x' },
  approved_with_conditions: { label: 'Approved with conditions', tone: 'warn', mark: 'check' },
  masked: { label: 'Masked', tone: 'info', mark: 'dot' },
  blocked: { label: 'Blocked', tone: 'bad', mark: 'x' },
  allowed: { label: 'Allowed', tone: 'ok', mark: 'check' },
}

const TONE_CLASSES: Record<Tone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-surface-2 text-muted', dot: 'border-muted bg-muted' },
  info: { pill: 'bg-accent-soft text-accent', dot: 'border-accent bg-accent' },
  ok: { pill: 'bg-ok-soft text-ok', dot: 'border-ok bg-ok' },
  warn: { pill: 'bg-warn-soft text-warn', dot: 'border-warn bg-warn' },
  bad: { pill: 'bg-bad-soft text-bad', dot: 'border-bad bg-bad' },
}

function MarkIcon({ mark, tone }: { mark: Mark; tone: Tone }) {
  const dot = TONE_CLASSES[tone].dot
  switch (mark) {
    case 'hollow':
      return <span className={cn('size-2 rounded-full border-[1.5px] bg-transparent!', dot)} />
    case 'dot':
      return <span className={cn('size-2 rounded-full border', dot)} />
    case 'clock':
      return <ClockIcon className="size-3.5" strokeWidth={2.25} />
    case 'check':
      return <CheckIcon className="size-3.5" strokeWidth={2.5} />
    case 'x':
      return <XIcon className="size-3.5" strokeWidth={2.5} />
    case 'alert':
      return <AlertTriangleIcon className="size-3.5" strokeWidth={2.25} />
    case 'strike':
      return <span className={cn('h-px w-2', dot)} />
  }
}

/** Status shown by form, not colour alone: every pill has a mark plus a label. */
export function StatusPill({
  status,
  label,
  className,
}: {
  status: string
  /** Override the preset label (e.g. "Overdue 3 d"). */
  label?: string
  className?: string
}) {
  const style = STATUS_STYLES[status] ?? {
    label: status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    tone: 'neutral' as const,
    mark: 'dot' as const,
  }
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[style.tone].pill,
        className,
      )}
    >
      <MarkIcon mark={style.mark} tone={style.tone} />
      <span className={cn(style.mark === 'strike' && 'line-through')}>{label ?? style.label}</span>
    </span>
  )
}

const SEVERITY: Record<Severity, { label: string; tone: Tone; bars: number }> = {
  low: { label: 'Low', tone: 'neutral', bars: 1 },
  medium: { label: 'Medium', tone: 'warn', bars: 2 },
  high: { label: 'High', tone: 'bad', bars: 3 },
  critical: { label: 'Critical', tone: 'bad', bars: 4 },
}

/** Severity label with a 4-step bar glyph, so it reads without colour. */
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEVERITY[severity]
  return (
    <span
      data-severity={severity}
      className={cn(
        'inline-flex h-5.5 items-center gap-1.5 rounded-sm px-1.5 text-xs font-semibold',
        TONE_CLASSES[s.tone].pill,
        className,
      )}
    >
      <span className="flex items-end gap-px" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn('w-0.75 rounded-[1px]', i <= s.bars ? 'bg-current' : 'bg-current/25')}
            style={{ height: `${3 + i * 2}px` }}
          />
        ))}
      </span>
      {s.label}
    </span>
  )
}

/** Left stripe class for severity cards. */
export function severityStripe(severity: Severity): string {
  return {
    low: 'border-l-4 border-l-muted',
    medium: 'border-l-4 border-l-warn',
    high: 'border-l-4 border-l-bad',
    critical: 'border-l-4 border-l-bad',
  }[severity]
}
