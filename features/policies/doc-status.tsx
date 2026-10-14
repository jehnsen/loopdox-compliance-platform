import { ClockIcon } from 'lucide-react'
import type { DocumentStatus, ReviewState } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { StatusPill } from '@/components/status-pill'

export const DOC_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  retired: 'Retired',
}

export function DocStatusPill({ status }: { status: DocumentStatus }) {
  return <StatusPill status={status} />
}

/** "Review overdue" / "Review due soon"; nothing when the review date is comfortably ahead. */
export function ReviewPill({
  state,
  className,
}: {
  state: ReviewState | null
  className?: string
}) {
  if (state === 'overdue') return <StatusPill status="review_overdue" className={className} />
  if (state === 'due_soon') return <StatusPill status="review_due_soon" className={className} />
  return null
}

/**
 * Compact status mark for the tree. Shape carries meaning without colour:
 * hollow = draft, filled = in review / approved, clock = review overdue, dash = retired.
 */
export function StatusDot({
  status,
  reviewState,
}: {
  status: DocumentStatus
  reviewState: ReviewState | null
}) {
  const label =
    reviewState === 'overdue'
      ? `${DOC_STATUS_LABELS[status]}, review overdue`
      : DOC_STATUS_LABELS[status]
  if (status === 'approved' && reviewState === 'overdue') {
    return (
      <ClockIcon
        className="size-3 shrink-0 text-bad"
        strokeWidth={2.5}
        aria-label={label}
        role="img"
      />
    )
  }
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'inline-block shrink-0',
        status === 'draft' && 'size-2 rounded-full border-[1.5px] border-muted',
        status === 'in_review' && 'size-2 rounded-full bg-warn',
        status === 'approved' && 'size-2 rounded-full bg-ok',
        status === 'retired' && 'h-0.5 w-2 bg-muted',
      )}
    />
  )
}
