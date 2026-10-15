import type {
  AgreementRole,
  AgreementType,
  DataFlowStage,
  DsrChannel,
  DsrOutcome,
  DsrStatus,
  DsrType,
  DueState,
  IncidentStatus,
  LegalBasis,
  PiaDecision,
  ProcessingWarning,
  RecipientKind,
} from '@/lib/api/types'
import { daysUntil } from '@/lib/utils/dates'
import { maskValue } from '@/lib/utils/format'

/** Labels and small rules for the Privacy module, shared by the UI and the mock API. */

export const LEGAL_BASIS_LABELS: Record<LegalBasis, string> = {
  consent: 'Consent',
  contract: 'Contract',
  legal_obligation: 'Legal obligation',
  vital_interests: 'Vital interests',
  public_authority: 'Public authority or emergency',
  legitimate_interests: 'Legitimate interests',
}

export const RECIPIENT_KIND_LABELS: Record<RecipientKind, string> = {
  internal: 'Internal team',
  third_party: 'Third party',
  authority: 'Government or regulator',
}

export const PROCESSING_WARNING_LABELS: Record<ProcessingWarning, string> = {
  no_pia: 'No PIA',
  no_agreement: 'No agreement for recipient',
  no_retention: 'Retention not set',
}

export const DATA_FLOW_STAGES: readonly DataFlowStage[] = [
  'collection',
  'use',
  'storage',
  'sharing',
  'disposal',
]

export const DATA_FLOW_LABELS: Record<DataFlowStage, { label: string; hint: string }> = {
  collection: {
    label: 'Collection',
    hint: 'How the data comes in: forms, email, systems, other organisations.',
  },
  use: { label: 'Use', hint: 'Who uses it inside the organisation, and for what.' },
  storage: { label: 'Storage', hint: 'Where it is kept, and how it is protected.' },
  sharing: {
    label: 'Sharing and transfer',
    hint: 'Who outside receives it, and in which countries.',
  },
  disposal: {
    label: 'Retention and disposal',
    hint: 'How long it is kept, and how it is destroyed.',
  },
}

export const PIA_DECISION_LABELS: Record<PiaDecision, string> = {
  proceed: 'Proceed',
  proceed_with_conditions: 'Proceed with conditions',
  do_not_proceed: 'Do not proceed',
}

export const PIA_STEPS = ['Scope', 'Data flows', 'Risks', 'Mitigations', 'Decision'] as const

export const DSR_TYPE_LABELS: Record<DsrType, string> = {
  access: 'Access',
  correction: 'Correction',
  erasure: 'Erasure or blocking',
  objection: 'Objection',
  portability: 'Data portability',
  other: 'Other',
}

export const DSR_STATUS_ORDER: readonly DsrStatus[] = [
  'received',
  'identity_verified',
  'in_progress',
  'responded',
  'closed',
]

export const DSR_STATUS_LABELS: Record<DsrStatus, string> = {
  received: 'Received',
  identity_verified: 'Identity verified',
  in_progress: 'In progress',
  responded: 'Responded',
  closed: 'Closed',
}

export const DSR_CHANNEL_LABELS: Record<DsrChannel, string> = {
  email: 'Email',
  web_form: 'Web form',
  phone: 'Phone',
  letter: 'Letter',
  in_person: 'In person',
  other: 'Other',
}

export const DSR_OUTCOME_LABELS: Record<DsrOutcome, string> = {
  granted: 'Granted',
  partially_granted: 'Partially granted',
  denied: 'Denied',
  withdrawn: 'Withdrawn by requester',
}

export const INCIDENT_STATUS_ORDER: readonly IncidentStatus[] = [
  'reported',
  'triage',
  'contained',
  'notified',
  'closed',
]

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  reported: 'Reported',
  triage: 'Triage',
  contained: 'Contained',
  notified: 'Notified',
  closed: 'Closed',
}

export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  dpa: 'Data processing agreement',
  data_sharing: 'Data sharing agreement',
  nda: 'Non-disclosure agreement',
  msa: 'Master services agreement',
}

export const AGREEMENT_TYPE_SHORT: Record<AgreementType, string> = {
  dpa: 'DPA',
  data_sharing: 'Data sharing',
  nda: 'NDA',
  msa: 'MSA',
}

export const AGREEMENT_ROLE_LABELS: Record<AgreementRole, string> = {
  we_are_processor: 'We process for them',
  we_are_controller: 'They process for us',
}

/** Due within this many days counts as "due soon" for DSRs. */
export const DSR_DUE_SOON_DAYS = 7
/** Renewals (agreements, NPC registration) and training expiring within this many days are flagged. */
export const RENEWAL_LEAD_DAYS = 30

/** ok / due_soon / overdue for a calendar date in the tenant timezone. */
export function dueStateOf(
  date: string,
  leadDays: number,
  tz: string,
  now: Date,
): { state: DueState; days: number } {
  const days = daysUntil(date, tz, now)
  return { state: days < 0 ? 'overdue' : days <= leadDays ? 'due_soon' : 'ok', days }
}

/** Adds whole days to a "yyyy-MM-dd" calendar date. */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** "Maria Clara Dela Cruz" → "M•••• C•••• D•••• C••••". */
export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => `${w.charAt(0).toUpperCase()}••••`)
    .join(' ')
}

/** Emails keep their first letter and domain; anything else keeps its last 4 characters. */
export function maskContact(contact: string): string {
  const at = contact.indexOf('@')
  if (at > 0) return `${contact.charAt(0)}••••${contact.slice(at)}`
  return maskValue(contact.replace(/\s+/g, ''))
}
