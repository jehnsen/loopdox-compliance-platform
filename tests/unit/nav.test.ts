import { describe, expect, it } from 'vitest'
import { findNavItem, visibleNav } from '@/lib/nav'

const ids = (groups: ReturnType<typeof visibleNav>) => groups.map((g) => g.id)
const items = (groups: ReturnType<typeof visibleNav>) =>
  groups.flatMap((g) => g.items.map((i) => i.id))

describe('visibleNav', () => {
  it('shows an admin every group on Premium, nothing locked', () => {
    const nav = visibleNav('3rdloop', ['admin', 'dpo', 'cto'], 'premium')
    expect(ids(nav)).toEqual([
      'overview',
      'policies',
      'privacy',
      'security',
      'evidence',
      'ask',
      'questionnaires',
      'ai',
      'settings',
    ])
    expect(nav.flatMap((g) => g.items).some((i) => i.locked)).toBe(false)
    expect(nav[1]?.items[0]?.href).toBe('/3rdloop/policies')
  })

  it('hides what staff cannot access', () => {
    const nav = visibleNav('3rdloop', ['staff'], 'premium')
    expect(ids(nav)).toEqual(['overview', 'policies', 'ask', 'settings'])
    expect(items(nav)).toEqual(['overview', 'policies', 'my-policies', 'ask', 'notifications'])
  })

  it('keeps tier-locked items visible with a lock on Starter', () => {
    const nav = visibleNav('sample-clinic', ['admin'], 'starter')
    const security = nav.find((g) => g.id === 'security')
    expect(security?.items.every((i) => i.locked)).toBe(true)
    expect(nav.find((g) => g.id === 'ai')?.items.every((i) => i.locked)).toBe(true)
    expect(nav.find((g) => g.id === 'privacy')?.items.some((i) => i.locked)).toBe(false)
    expect(nav.find((g) => g.id === 'ask')?.items[0]?.locked).toBe(false)
  })

  it('shows a VisorShield-only tenant just Overview, AI Governance and Settings', () => {
    expect(ids(visibleNav('vs', ['owner'], 'visorshield_only'))).toEqual([
      'overview',
      'ai',
      'settings',
    ])
  })

  it('gives auditors read-only areas and no admin settings', () => {
    const nav = visibleNav('3rdloop', ['auditor'], 'premium')
    expect(ids(nav)).toContain('evidence')
    expect(ids(nav)).not.toContain('questionnaires')
    expect(items(nav)).not.toContain('members')
    expect(items(nav)).not.toContain('my-policies')
  })
})

describe('findNavItem', () => {
  it('matches the longest path prefix', () => {
    expect(findNavItem('/ai-governance/keys')?.item.id).toBe('ai-keys')
    expect(findNavItem('/ai-governance')?.item.id).toBe('ai-overview')
    expect(findNavItem('/privacy/requests/dsr_1')?.item.id).toBe('requests')
    expect(findNavItem('')?.item.id).toBe('overview')
    expect(findNavItem('/nope')).toBeNull()
  })
})
