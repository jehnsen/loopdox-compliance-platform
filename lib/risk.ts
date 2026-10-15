import type { Score } from '@/lib/api/types'

/** Likelihood × impact scoring on a 5×5 matrix. Used by PIAs now and the risk register in M5. */

export const SCORES: readonly Score[] = [1, 2, 3, 4, 5]

export const LIKELIHOOD_LABELS: Record<Score, string> = {
  1: 'Rare',
  2: 'Unlikely',
  3: 'Possible',
  4: 'Likely',
  5: 'Almost certain',
}

export const IMPACT_LABELS: Record<Score, string> = {
  1: 'Negligible',
  2: 'Minor',
  3: 'Moderate',
  4: 'Major',
  5: 'Severe',
}

export type ScoreBand = 'low' | 'medium' | 'high' | 'critical'

export const BAND_LABELS: Record<ScoreBand, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

export function riskScore(likelihood: Score, impact: Score): number {
  return likelihood * impact
}

/** 1–4 low · 5–9 medium · 10–16 high · 20–25 critical. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 20) return 'critical'
  if (score >= 10) return 'high'
  if (score >= 5) return 'medium'
  return 'low'
}

/** Highest score among the risks (the worst case drives the decision); null with none. */
export function overallScore(
  risks: readonly { likelihood: Score; impact: Score }[],
): number | null {
  if (!risks.length) return null
  return Math.max(...risks.map((r) => riskScore(r.likelihood, r.impact)))
}
