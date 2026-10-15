import type {
  ConnectorProvider,
  ControlStatus,
  EvidenceResult,
  EvidenceSource,
  Framework,
} from '@/lib/api/types'
import { addMonthsToDate } from '@/lib/utils/dates'

/** Labels and small rules for the Evidence module, shared by the UI and the mock API. */

export const RESULT_LABELS: Record<EvidenceResult, string> = {
  pass: 'Pass',
  fail: 'Fail',
  info: 'Info',
}

export const SOURCE_LABELS: Record<EvidenceSource, string> = {
  connector: 'Connector',
  upload: 'Upload',
  manual: 'Recorded in LoopDox',
}

export const FREQUENCY_LABELS: Record<string, string> = {
  continuous: 'Continuous',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
}

export const FRAMEWORK_ORDER: readonly Framework[] = ['ISO27001:2022', 'DPA', 'NPC', 'internal']

/** Position of a framework in lists, so ISO 27001 comes before the Data Privacy Act. */
export function frameworkRank(framework: Framework): number {
  return FRAMEWORK_ORDER.indexOf(framework)
}

/**
 * A control's status from its evidence: the newest pass or fail decides, and an
 * `info` item never changes it. Not applicable is a decision people make, so it stays.
 */
export function controlStatusFrom(
  current: ControlStatus,
  evidence: readonly { result: EvidenceResult; collectedAt: string }[],
): ControlStatus {
  if (current === 'not_applicable') return current
  let newest: { result: EvidenceResult; collectedAt: string } | null = null
  for (const e of evidence) {
    if (e.result === 'info') continue
    if (!newest || e.collectedAt > newest.collectedAt) newest = e
  }
  if (!newest) return 'no_evidence'
  return newest.result === 'fail' ? 'failing' : 'passing'
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

export interface ConnectorCheckDef {
  id: string
  name: string
  /** Reference of the control the result is recorded against, e.g. "A.8.32". */
  control: string
}

export interface ProviderInfo {
  name: string
  description: string
  /** What the field on the connect dialog calls the account. */
  accountLabel: string
  accountExample: string
  schedule: string
  checks: readonly ConnectorCheckDef[]
}

/** The four providers the spec lists, in the order the cards show them. */
export const PROVIDER_ORDER: readonly ConnectorProvider[] = [
  'github',
  'azure',
  'google_workspace',
  'hostinger',
]

export const PROVIDERS: Record<ConnectorProvider, ProviderInfo> = {
  github: {
    name: 'GitHub',
    description: 'Source code, reviews and repository security settings.',
    accountLabel: 'GitHub organisation',
    accountExample: '3rdloop',
    schedule: 'Every day',
    checks: [
      {
        id: 'github.branch_protection',
        name: 'Branch protection on default branches',
        control: 'A.8.32',
      },
      {
        id: 'github.secret_scanning',
        name: 'Secret scanning on every repository',
        control: 'A.8.25',
      },
    ],
  },
  azure: {
    name: 'Microsoft Azure',
    description: 'Cloud subscriptions, activity logs and encryption settings.',
    accountLabel: 'Azure tenant',
    accountExample: '3rdloop.onmicrosoft.com',
    schedule: 'Every day',
    checks: [
      { id: 'azure.activity_logs', name: 'Activity logs kept for 365 days', control: 'A.8.15' },
      { id: 'azure.encryption', name: 'Storage encrypted at rest', control: 'A.8.24' },
    ],
  },
  google_workspace: {
    name: 'Google Workspace',
    description: 'Staff accounts, sign-in security and admin roles.',
    accountLabel: 'Workspace domain',
    accountExample: '3rdloop.example',
    schedule: 'Every day',
    checks: [
      { id: 'google.two_step', name: '2-step verification enforced', control: 'A.5.17' },
      { id: 'google.inactive', name: 'Inactive accounts suspended', control: 'A.5.18' },
    ],
  },
  hostinger: {
    name: 'Hostinger',
    description: 'Hosting, backups and certificates for public websites.',
    accountLabel: 'Hostinger account',
    accountExample: 'ops@3rdloop.example',
    schedule: 'Every day',
    checks: [
      { id: 'hostinger.backups', name: 'Daily backups enabled', control: 'A.8.13' },
      {
        id: 'hostinger.certificates',
        name: 'Certificates valid for 30 days or more',
        control: 'A.8.24',
      },
    ],
  },
}

/** Words a person can put in the connect form's account field. */
export const ACCOUNT_MAX = 120

// ---------------------------------------------------------------------------
// Audit pack periods
// ---------------------------------------------------------------------------

export type PeriodKey = '90d' | '12m' | 'ytd' | 'last-year' | 'all' | 'custom'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '90d': 'Last 90 days',
  '12m': 'Last 12 months',
  ytd: 'This year',
  'last-year': 'Last year',
  all: 'All time',
  custom: 'Custom range',
}

export const DEFAULT_PERIOD: PeriodKey = '12m'

/** "2026-10-14" → the dates a preset covers. `to` is the inclusive last day. */
export function periodRange(
  key: Exclude<PeriodKey, 'custom'>,
  today: string,
): { from: string | null; to: string | null } {
  const year = Number(today.slice(0, 4))
  switch (key) {
    case '90d': {
      const from = new Date(Date.parse(`${today}T00:00:00Z`) - 89 * 86_400_000)
      return { from: from.toISOString().slice(0, 10), to: today }
    }
    case '12m':
      return { from: addMonthsToDate(today, -12), to: today }
    case 'ytd':
      return { from: `${year}-01-01`, to: today }
    case 'last-year':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
    case 'all':
      return { from: null, to: null }
  }
}
