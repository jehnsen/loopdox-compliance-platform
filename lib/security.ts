import type {
  AccessLevel,
  ChangeSource,
  DecisionStatus,
  DueState,
  ReviewDecision,
  RiskTreatment,
  SystemType,
} from '@/lib/api/types'
import { addDaysToDate } from '@/lib/privacy'
import { daysUntil } from '@/lib/utils/dates'

/** Labels and small rules for the Security module, shared by the UI and the mock API. */

export const SYSTEM_TYPE_LABELS: Record<SystemType, string> = {
  server: 'Server',
  cloud_account: 'Cloud account',
  repository: 'Repository',
  domain: 'Domain',
  saas: 'SaaS application',
  database: 'Database',
  other: 'Other',
}

export const ACCESS_LEVELS: readonly AccessLevel[] = ['owner', 'admin', 'write', 'read']

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  owner: 'Owner',
  admin: 'Admin',
  write: 'Read and write',
  read: 'Read only',
}

/** Owner and admin grants can change other people's access, so they get a second look. */
export const PRIVILEGED_LEVELS: readonly AccessLevel[] = ['owner', 'admin']

export const REVIEW_DECISION_LABELS: Record<ReviewDecision, string> = {
  keep: 'Keep',
  revoke: 'Revoke',
  change: 'Change',
}

export const CHANGE_SOURCE_LABELS: Record<ChangeSource, string> = {
  github_pr: 'GitHub pull request',
  deploy: 'Deployment',
  manual: 'Manual change',
}

export const TREATMENT_LABELS: Record<RiskTreatment, string> = {
  mitigate: 'Mitigate',
  accept: 'Accept',
  transfer: 'Transfer',
  avoid: 'Avoid',
}

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  superseded: 'Superseded',
}

/** Secrets are flagged this many days before they fall due. */
export const SECRET_DUE_SOON_DAYS = 14
/** An emergency change needs a review note within this long after deployment. */
export const EMERGENCY_REVIEW_HOURS = 48
/** Risks are flagged this many days before their review date. */
export const RISK_REVIEW_LEAD_DAYS = 30

/** The control that receives evidence when an access review is signed off. */
export const ACCESS_REVIEW_CONTROL_REFERENCE = 'A.5.15'

export function nextRotationDate(lastRotatedAt: string, rotationDays: number): string {
  return addDaysToDate(lastRotatedAt, rotationDays)
}

/** ok / due_soon / overdue for a calendar date, in the tenant timezone. */
export function dueStateFor(
  date: string,
  leadDays: number,
  tz: string,
  now: Date,
): { state: DueState; days: number } {
  const days = daysUntil(date, tz, now)
  return { state: days < 0 ? 'overdue' : days <= leadDays ? 'due_soon' : 'ok', days }
}

/** "2026-Q4" for a calendar date. */
export function periodOf(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
}

/** First day of a "2026-Q4" period. */
export function periodStart(period: string): string {
  const [y, q] = period.split('-Q').map(Number) as [number, number]
  return `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`
}

/** Last day of a "2026-Q4" period. */
export function periodEnd(period: string): string {
  const [y, q] = period.split('-Q').map(Number) as [number, number]
  const lastMonth = q * 3
  const lastDay = new Date(Date.UTC(y, lastMonth, 0)).getUTCDate()
  return `${y}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

/** The period before `period`: 2026-Q1 → 2025-Q4. */
export function previousPeriod(period: string): string {
  const [y, q] = period.split('-Q').map(Number) as [number, number]
  return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`
}
