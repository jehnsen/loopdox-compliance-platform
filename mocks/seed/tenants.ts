import type { Org, Role } from '@/lib/api/types'
import type { MockInvite, MockMembership, MockUser } from '@/mocks/store'

/** Demo password for every seeded user (mock mode only). */
export const MOCK_PASSWORD = 'loopdox-demo'

const classificationLabels = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  restricted: 'Restricted',
}

export function seedOrgs(now: Date): Org[] {
  const created = new Date(now.getTime() - 400 * 86_400_000).toISOString()
  return [
    {
      id: 'org_3rdloop',
      slug: '3rdloop',
      name: '3rdLoop Solutions Corp.',
      tier: 'premium',
      timezone: 'Asia/Manila',
      currency: 'PHP',
      logoUrl: null,
      settings: { dsrResponseDays: 30, reviewReminderLeadDays: 30, classificationLabels },
      version: 1,
      createdAt: created,
      updatedAt: created,
    },
    {
      id: 'org_sample_clinic',
      slug: 'sample-clinic',
      name: 'Sample Clinic',
      tier: 'starter',
      timezone: 'Asia/Manila',
      currency: 'PHP',
      logoUrl: null,
      settings: { dsrResponseDays: 30, reviewReminderLeadDays: 30, classificationLabels },
      version: 1,
      createdAt: created,
      updatedAt: created,
    },
  ]
}

/** Names are editable seed values. Emails use the reserved .example TLD. */
export const SEED_USERS: readonly Omit<MockUser, 'password'>[] = [
  {
    id: 'usr_jehnsen',
    name: 'Jehnsen Enrique',
    email: 'jehnsen.enrique@3rdloop.example',
    title: 'Chief Technology Officer (acting DPO)',
  },
  {
    id: 'usr_michael',
    name: 'Michael Manabat',
    email: 'michael.manabat@3rdloop.example',
    title: 'Chairman & CEO',
  },
  {
    id: 'usr_staff',
    name: 'Staff Member',
    email: 'staff@3rdloop.example',
    title: 'Software Engineer',
  },
  {
    id: 'usr_auditor',
    name: 'External Auditor',
    email: 'auditor@audit-firm.example',
    title: 'ISO 27001 Lead Auditor',
  },
  {
    id: 'usr_clinic_dpo',
    name: 'Dra. Liza Santos',
    email: 'liza.santos@sample-clinic.example',
    title: 'Medical Director & DPO',
  },
  {
    id: 'usr_clinic_staff',
    name: 'Clinic Front Desk',
    email: 'frontdesk@sample-clinic.example',
    title: 'Front Desk Officer',
  },
]

export function seedUsers(): MockUser[] {
  return SEED_USERS.map((u) => ({ ...u, password: MOCK_PASSWORD }))
}

export function seedMemberships(now: Date): MockMembership[] {
  const joined = new Date(now.getTime() - 300 * 86_400_000).toISOString()
  const m = (
    id: string,
    orgId: string,
    userId: string,
    roles: Role[],
    expiresAt: string | null = null,
  ): MockMembership => ({
    id,
    orgId,
    userId,
    roles,
    status: 'active',
    expiresAt,
    invitedAt: joined,
    joinedAt: joined,
    version: 1,
  })
  const in60d = new Date(now.getTime() + 60 * 86_400_000).toISOString()
  return [
    m('mem_3l_jehnsen', 'org_3rdloop', 'usr_jehnsen', ['admin', 'dpo', 'cto']),
    m('mem_3l_michael', 'org_3rdloop', 'usr_michael', ['approver']),
    m('mem_3l_staff', 'org_3rdloop', 'usr_staff', ['staff']),
    m('mem_3l_auditor', 'org_3rdloop', 'usr_auditor', ['auditor'], in60d),
    // 3rdLoop administers the clinic's workspace as its service provider.
    m('mem_sc_jehnsen', 'org_sample_clinic', 'usr_jehnsen', ['admin']),
    m('mem_sc_dpo', 'org_sample_clinic', 'usr_clinic_dpo', ['owner', 'dpo', 'approver']),
    m('mem_sc_staff', 'org_sample_clinic', 'usr_clinic_staff', ['staff']),
  ]
}

export function seedInvites(now: Date): MockInvite[] {
  return [
    {
      token: 'demo-invite-token',
      orgId: 'org_3rdloop',
      email: 'new.hire@3rdloop.example',
      roles: ['staff'],
      invitedBy: 'usr_jehnsen',
      expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
      acceptedAt: null,
    },
  ]
}
