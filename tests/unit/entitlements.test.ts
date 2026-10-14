import { describe, expect, it } from 'vitest'
import { featureCap, hasFeature, minimumTierFor, STARTER_ASK_MONTHLY_CAP } from '@/lib/entitlements'

describe('entitlements (section 5.3)', () => {
  it('starter has policies, privacy and capped Ask only', () => {
    expect(hasFeature('starter', 'policies')).toBe(true)
    expect(hasFeature('starter', 'privacy')).toBe(true)
    expect(hasFeature('starter', 'ask.policy')).toBe(true)
    expect(featureCap('starter', 'ask.policy')).toBe(STARTER_ASK_MONTHLY_CAP)
    for (const f of [
      'ask.records',
      'ask.impact',
      'security',
      'evidence',
      'questionnaires',
      'auditorGuests',
      'aiGovernance',
    ] as const) {
      expect(hasFeature('starter', f)).toBe(false)
    }
  })

  it('pro has everything except AI governance, with uncapped Ask', () => {
    expect(hasFeature('pro', 'security')).toBe(true)
    expect(hasFeature('pro', 'questionnaires')).toBe(true)
    expect(featureCap('pro', 'ask.policy')).toBeNull()
    expect(hasFeature('pro', 'aiGovernance')).toBe(false)
  })

  it('premium has everything', () => {
    expect(hasFeature('premium', 'aiGovernance')).toBe(true)
    expect(hasFeature('premium', 'evidence')).toBe(true)
  })

  it('visorshield_only has AI governance only', () => {
    expect(hasFeature('visorshield_only', 'aiGovernance')).toBe(true)
    expect(hasFeature('visorshield_only', 'policies')).toBe(false)
    expect(hasFeature('visorshield_only', 'ask.policy')).toBe(false)
  })

  it('names the lowest plan that fully includes a feature', () => {
    expect(minimumTierFor('security')).toBe('pro')
    expect(minimumTierFor('aiGovernance')).toBe('premium')
    expect(minimumTierFor('ask.policy')).toBe('pro')
    expect(minimumTierFor('policies')).toBe('starter')
  })
})
