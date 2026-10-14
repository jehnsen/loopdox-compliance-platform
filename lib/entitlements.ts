import type { Tier } from '@/lib/api/types'

/** Feature keys gated by plan (section 5.3). */
export type Feature =
  | 'policies'
  | 'privacy'
  | 'ask.policy'
  | 'ask.records'
  | 'ask.impact'
  | 'security'
  | 'evidence'
  | 'questionnaires'
  | 'auditorGuests'
  | 'aiGovernance'

/** `true` = included, `false` = not included, `{ monthlyCap }` = included up to a monthly limit. */
export type Entitlement = boolean | { monthlyCap: number }

export const STARTER_ASK_MONTHLY_CAP = 100

export const TIER_FEATURES: Record<Tier, Record<Feature, Entitlement>> = {
  starter: {
    policies: true,
    privacy: true,
    'ask.policy': { monthlyCap: STARTER_ASK_MONTHLY_CAP },
    'ask.records': false,
    'ask.impact': false,
    security: false,
    evidence: false,
    questionnaires: false,
    auditorGuests: false,
    aiGovernance: false,
  },
  pro: {
    policies: true,
    privacy: true,
    'ask.policy': true,
    'ask.records': true,
    'ask.impact': true,
    security: true,
    evidence: true,
    questionnaires: true,
    auditorGuests: true,
    aiGovernance: false,
  },
  premium: {
    policies: true,
    privacy: true,
    'ask.policy': true,
    'ask.records': true,
    'ask.impact': true,
    security: true,
    evidence: true,
    questionnaires: true,
    auditorGuests: true,
    aiGovernance: true,
  },
  // VisorShield sold on its own: only Overview, AI Governance and Settings.
  visorshield_only: {
    policies: false,
    privacy: false,
    'ask.policy': false,
    'ask.records': false,
    'ask.impact': false,
    security: false,
    evidence: false,
    questionnaires: false,
    auditorGuests: false,
    aiGovernance: true,
  },
}

export const TIER_LABELS: Record<Tier, string> = {
  starter: 'Starter',
  pro: 'Pro',
  premium: 'Premium',
  visorshield_only: 'VisorShield',
}

/** Ordered plans a customer can upgrade through (VisorShield-only is sold separately). */
export const UPGRADE_PATH: readonly Tier[] = ['starter', 'pro', 'premium']

export interface FeatureInfo {
  title: string
  description: string
}

export const FEATURE_INFO: Record<Feature, FeatureInfo> = {
  policies: {
    title: 'Policies',
    description:
      'A versioned policy library with approvals, review dates and staff acknowledgement.',
  },
  privacy: {
    title: 'Privacy',
    description:
      'Records of processing, impact assessments, data subject requests, breach log with the 72-hour clock, agreements and NPC registration.',
  },
  'ask.policy': {
    title: 'Ask your policies',
    description: 'Answers from your approved policies, always with citations.',
  },
  'ask.records': {
    title: 'Ask your records',
    description:
      'Answers drawn from your privacy and security registers, with links to each record.',
  },
  'ask.impact': {
    title: 'Impact questions',
    description:
      'Trace what a change touches across systems, processing records, policies and controls.',
  },
  security: {
    title: 'Security registers',
    description:
      'Asset and access inventory, quarterly access reviews, secret rotation tracking, change log, risk register and decision records.',
  },
  evidence: {
    title: 'Evidence',
    description:
      'Controls mapped to ISO/IEC 27001 and the Data Privacy Act, with evidence collected by connectors or uploaded, and an auditor view.',
  },
  questionnaires: {
    title: 'Security questionnaires',
    description: 'Upload a client questionnaire and get cited draft answers to review and export.',
  },
  auditorGuests: {
    title: 'Auditor guests',
    description: 'Invite external auditors with read-only, time-limited access to an audit pack.',
  },
  aiGovernance: {
    title: 'AI Governance',
    description:
      'Manage VisorShield: AI inventory and risk assessments, PII masking profiles, provider keys, and proxy statistics as evidence.',
  },
}

export function entitlement(tier: Tier, feature: Feature): Entitlement {
  return TIER_FEATURES[tier][feature]
}

export function hasFeature(tier: Tier, feature: Feature): boolean {
  return entitlement(tier, feature) !== false
}

/** Monthly cap for a capped feature; null when unlimited or not included. */
export function featureCap(tier: Tier, feature: Feature): number | null {
  const e = entitlement(tier, feature)
  return typeof e === 'object' ? e.monthlyCap : null
}

/** Lowest plan on the upgrade path that includes the feature without a cap. */
export function minimumTierFor(feature: Feature): Tier {
  return UPGRADE_PATH.find((t) => TIER_FEATURES[t][feature] === true) ?? 'premium'
}
