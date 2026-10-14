import { describe, expect, it } from 'vitest'
import type { Permission, Role } from '@/lib/api/types'
import { can, isAuditorOnly, permissionsForRoles } from '@/lib/auth/permissions'

const as = (...roles: Role[]) => ({ roles })

/** Section 5.2 matrix. ✓ = allowed. */
const MATRIX: [Permission, Role[]][] = [
  ['policies.read', ['owner', 'admin', 'dpo', 'cto', 'approver', 'staff', 'auditor']],
  ['policies.read_drafts', ['owner', 'admin', 'dpo', 'cto', 'approver']],
  ['policies.edit', ['owner', 'admin', 'dpo', 'cto']],
  ['policies.approve', ['owner', 'admin', 'approver']],
  ['privacy.read', ['owner', 'admin', 'dpo', 'cto', 'approver', 'auditor']],
  ['privacy.edit', ['owner', 'admin', 'dpo']],
  ['incidents.report', ['owner', 'admin', 'dpo', 'cto', 'approver', 'staff']],
  ['incidents.sign_off', ['owner', 'admin', 'approver']],
  ['security.read', ['owner', 'admin', 'dpo', 'cto', 'approver', 'auditor']],
  ['security.edit', ['owner', 'admin', 'cto']],
  ['evidence.read', ['owner', 'admin', 'dpo', 'cto', 'approver', 'auditor']],
  ['evidence.edit', ['owner', 'admin', 'dpo', 'cto']],
  ['ask.use', ['owner', 'admin', 'dpo', 'cto', 'approver', 'staff', 'auditor']],
  ['questionnaires.read', ['owner', 'admin', 'dpo', 'cto', 'approver']],
  ['questionnaires.edit', ['owner', 'admin', 'dpo', 'cto']],
  ['ai.read', ['owner', 'admin', 'dpo', 'cto', 'approver', 'auditor']],
  ['ai.edit', ['owner', 'admin', 'dpo', 'cto']],
  ['members.manage', ['owner', 'admin']],
  ['plan.manage', ['owner', 'admin']],
  ['sensitive.reveal', ['owner', 'admin', 'dpo']],
]

const ALL_ROLES: Role[] = ['owner', 'admin', 'dpo', 'cto', 'approver', 'staff', 'auditor']

describe('permission matrix (section 5.2)', () => {
  for (const [permission, allowed] of MATRIX) {
    for (const role of ALL_ROLES) {
      const expected = allowed.includes(role)
      it(`${role} ${expected ? 'can' : 'cannot'} ${permission}`, () => {
        expect(can(as(role), permission)).toBe(expected)
      })
    }
  }
})

describe('can()', () => {
  it('unions permissions across multiple roles', () => {
    const jehnsen = as('admin', 'dpo', 'cto')
    expect(can(jehnsen, 'security.edit')).toBe(true)
    expect(can(jehnsen, 'privacy.edit')).toBe(true)
    expect(permissionsForRoles(['dpo', 'cto'])).toContain('security.edit')
  })

  it('hides draft policies from staff and auditors', () => {
    expect(can(as('staff'), 'policies.read', { status: 'draft' })).toBe(false)
    expect(can(as('auditor'), 'policies.read', { status: 'in_review' })).toBe(false)
    expect(can(as('auditor'), 'policies.read', { status: 'approved' })).toBe(true)
    expect(can(as('approver'), 'policies.read', { status: 'draft' })).toBe(true)
  })

  it('limits auditors to approved privacy records', () => {
    expect(can(as('auditor'), 'privacy.read', { status: 'draft' })).toBe(false)
    expect(can(as('auditor'), 'privacy.read', { status: 'approved' })).toBe(true)
    expect(can(as('cto'), 'privacy.read', { status: 'draft' })).toBe(true)
  })

  it('identifies auditor-only guests', () => {
    expect(isAuditorOnly(as('auditor'))).toBe(true)
    expect(isAuditorOnly(as('auditor', 'staff'))).toBe(false)
    expect(isAuditorOnly(as())).toBe(false)
  })
})
