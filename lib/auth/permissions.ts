import type { Permission, Role } from '@/lib/api/types'

/**
 * Role → permission map (section 5.2). Shared by the UI and the mock API.
 * The UI uses it to hide or disable controls; the server is the authority.
 */
const ALL_PERMISSIONS: readonly Permission[] = [
  'policies.read',
  'policies.read_drafts',
  'policies.edit',
  'policies.approve',
  'policies.acknowledge',
  'privacy.read',
  'privacy.edit',
  'incidents.report',
  'incidents.sign_off',
  'security.read',
  'security.edit',
  'evidence.read',
  'evidence.edit',
  'ask.use',
  'questionnaires.read',
  'questionnaires.edit',
  'ai.read',
  'ai.edit',
  'org.manage',
  'members.manage',
  'plan.manage',
  'audit_log.read',
  'sensitive.reveal',
]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  dpo: [
    'policies.read',
    'policies.read_drafts',
    'policies.edit',
    'policies.acknowledge',
    'privacy.read',
    'privacy.edit',
    'incidents.report',
    'security.read',
    'evidence.read',
    'evidence.edit',
    'ask.use',
    'questionnaires.read',
    'questionnaires.edit',
    'ai.read',
    'ai.edit',
    'sensitive.reveal',
  ],
  cto: [
    'policies.read',
    'policies.read_drafts',
    'policies.edit',
    'policies.acknowledge',
    'privacy.read',
    'incidents.report',
    'security.read',
    'security.edit',
    'evidence.read',
    'evidence.edit',
    'ask.use',
    'questionnaires.read',
    'questionnaires.edit',
    'ai.read',
    'ai.edit',
  ],
  approver: [
    'policies.read',
    'policies.read_drafts',
    'policies.approve',
    'policies.acknowledge',
    'privacy.read',
    'incidents.report',
    'incidents.sign_off',
    'security.read',
    'evidence.read',
    'ask.use',
    'questionnaires.read',
    'ai.read',
  ],
  staff: ['policies.read', 'policies.acknowledge', 'incidents.report', 'ask.use'],
  auditor: [
    'policies.read',
    'privacy.read',
    'security.read',
    'evidence.read',
    'ask.use',
    'ai.read',
  ],
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  dpo: 'DPO',
  cto: 'CTO',
  approver: 'Approver',
  staff: 'Staff',
  auditor: 'Auditor',
}

export function permissionsForRoles(roles: readonly Role[]): Permission[] {
  const set = new Set<Permission>()
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role]) set.add(p)
  return [...set].sort()
}

export interface Subject {
  roles: readonly Role[]
}

/** Optional resource the action targets. Used for status-scoped rules. */
export interface Resource {
  status?: string
}

/** An auditor-only subject is an external read-only guest. */
export function isAuditorOnly(subject: Subject): boolean {
  return subject.roles.length > 0 && subject.roles.every((r) => r === 'auditor')
}

/**
 * Can `subject` perform `action` (optionally on `resource`)?
 *
 * Status rule: auditors (and anyone without `policies.read_drafts`) only see
 * approved policies; auditors only see approved privacy records.
 */
export function can(subject: Subject, action: Permission, resource?: Resource): boolean {
  const perms = permissionsForRoles(subject.roles)
  if (!perms.includes(action)) return false
  if (resource?.status && resource.status !== 'approved') {
    if (action === 'policies.read' && !perms.includes('policies.read_drafts')) return false
    if (action === 'privacy.read' && isAuditorOnly(subject)) return false
  }
  return true
}

/** Plain-language names for permissions, used in 403 messages. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'policies.read': 'read policies',
  'policies.read_drafts': 'read draft policies',
  'policies.edit': 'edit policies',
  'policies.approve': 'approve policies',
  'policies.acknowledge': 'acknowledge policies',
  'privacy.read': 'view privacy registers',
  'privacy.edit': 'edit privacy registers',
  'incidents.report': 'report incidents',
  'incidents.sign_off': 'sign off breach notices',
  'security.read': 'view security registers',
  'security.edit': 'edit security registers',
  'evidence.read': 'view evidence',
  'evidence.edit': 'manage evidence',
  'ask.use': 'use Ask',
  'questionnaires.read': 'view questionnaires',
  'questionnaires.edit': 'edit questionnaires',
  'ai.read': 'view AI governance',
  'ai.edit': 'manage AI governance',
  'org.manage': 'manage organisation settings',
  'members.manage': 'manage members',
  'plan.manage': 'manage the plan',
  'audit_log.read': 'view the audit log',
  'sensitive.reveal': 'reveal masked identifiers',
}
