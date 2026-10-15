import type { AttentionKind, ControlCoverage, DocumentCounts, Framework } from '@/lib/api/types'

/** Labels and ranking rules for the Overview dashboard, shared by the UI and the mock API. */

/** Ranking order: most serious class first. Overdue sorts ahead of upcoming within a class. */
export const ATTENTION_ORDER: readonly AttentionKind[] = [
  'breach_deadline',
  'dsr_due',
  'policy_approval',
  'secret_rotation',
  'access_review',
  'connector_failing',
  'review_overdue',
  'agreement_renewal',
]

export const ATTENTION_LABELS: Record<AttentionKind, { one: string; many: string }> = {
  breach_deadline: { one: 'Open breach', many: 'Open breaches' },
  dsr_due: { one: 'Request due', many: 'Requests due' },
  policy_approval: { one: 'Awaiting approval', many: 'Awaiting approval' },
  review_overdue: { one: 'Overdue review', many: 'Overdue reviews' },
  secret_rotation: { one: 'Overdue rotation', many: 'Overdue rotations' },
  access_review: { one: 'Access review due', many: 'Access reviews due' },
  connector_failing: { one: 'Failing connector', many: 'Failing connectors' },
  agreement_renewal: { one: 'Agreement renewing', many: 'Agreements renewing' },
}

/** "Due in 2 days", "Due today", "Overdue by 3 days". `days` is negative once past. */
export function dueInPhrase(days: number, due = 'Due'): string {
  if (days === 0) return `${due} today`
  const n = Math.abs(days)
  const unit = n === 1 ? 'day' : 'days'
  return days > 0 ? `${due} in ${n} ${unit}` : `Overdue by ${n} ${unit}`
}

export const DOCUMENT_STATUS_ORDER = ['approved', 'in_review', 'draft', 'retired'] as const

export function coverageOf(c: Pick<ControlCoverage, 'passing' | 'total'>): number {
  return c.total ? c.passing / c.total : 0
}

export function approvedShare(d: DocumentCounts): number {
  return d.total ? d.approved / d.total : 0
}

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  'ISO27001:2022': 'ISO/IEC 27001:2022',
  DPA: 'Data Privacy Act',
  NPC: 'NPC',
  internal: 'Internal',
}
