import { formatInTimeZone } from 'date-fns-tz'
import type { AuditEvent, Notification } from '@/lib/api/types'
import type { MockDB } from '@/mocks/store'
import { seedControls } from '@/mocks/seed/controls'
import { seedDocuments } from '@/mocks/seed/documents'
import { seedInvites, seedMemberships, seedOrgs, seedUsers } from '@/mocks/seed/tenants'

/** Bump when seed data changes shape; a persisted .mock-db.json with an older version is reseeded. */
export const SEED_VERSION = 2

const HOUR = 3_600_000

export function seedDatabase(now: Date): MockDB {
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR).toISOString()
  const month = formatInTimeZone(now, 'Asia/Manila', 'yyyy-MM')

  const notifications: Notification[] = [
    {
      id: 'ntf_1',
      orgId: 'org_3rdloop',
      userId: 'usr_jehnsen',
      type: 'deadline_breach',
      title: 'INC-2026-0003: NPC notification due in 42 h',
      body: 'Personal data may be involved. Decide whether notification is required.',
      href: '/3rdloop/privacy/incidents/inc_2026_0003',
      at: ago(2),
      readAt: null,
    },
    {
      id: 'ntf_2',
      orgId: 'org_3rdloop',
      userId: 'usr_jehnsen',
      type: 'deadline_dsr',
      title: 'DSR-2026-0012 is due in 2 days',
      body: 'Access request from a data subject. Assigned to you.',
      href: '/3rdloop/privacy/requests/dsr_2026_0012',
      at: ago(20),
      readAt: null,
    },
    {
      id: 'ntf_3',
      orgId: 'org_3rdloop',
      userId: 'usr_jehnsen',
      type: 'connector_failed',
      title: 'Hostinger connector failed',
      body: 'The API token was rejected. Reconnect to resume evidence collection.',
      href: '/3rdloop/evidence/connectors',
      at: ago(30),
      readAt: ago(29),
    },
    {
      id: 'ntf_4',
      orgId: 'org_3rdloop',
      userId: 'usr_michael',
      type: 'approval_requested',
      title: 'ITD-007 Access Control Policy is ready for your decision',
      body: 'Jehnsen Enrique submitted v3 for approval.',
      href: '/3rdloop/policies/doc_itd_007',
      at: ago(5),
      readAt: null,
    },
    {
      id: 'ntf_5',
      orgId: 'org_3rdloop',
      userId: 'usr_staff',
      type: 'deadline_review',
      title: 'Please acknowledge ITD-008 Acceptable Use Policy',
      body: 'A new version was approved. Read it and confirm you understand it.',
      href: '/3rdloop/my-policies',
      at: ago(48),
      readAt: null,
    },
    {
      id: 'ntf_6',
      orgId: 'org_sample_clinic',
      userId: 'usr_clinic_dpo',
      type: 'deadline_review',
      title: 'Data Privacy Policy review is due this month',
      body: 'The annual review date is approaching.',
      href: '/sample-clinic/policies',
      at: ago(10),
      readAt: null,
    },
  ]

  const auditEvents: AuditEvent[] = [
    {
      id: 'aud_seed_1',
      orgId: 'org_3rdloop',
      actor: { id: 'usr_jehnsen', name: 'Jehnsen Enrique' },
      action: 'org.created',
      targetType: 'org',
      targetId: 'org_3rdloop',
      targetLabel: '3rdLoop Solutions Corp.',
      at: ago(400 * 24),
      details: {},
    },
  ]

  const docs = seedDocuments(now)
  const controls = seedControls(
    now,
    new Map(docs.documents.filter((d) => d.orgId === 'org_3rdloop').map((d) => [d.docId, d.id])),
  )
  for (const doc of docs.documents) {
    doc.controlIds = controls.filter((c) => c.documentIds.includes(doc.id)).map((c) => c.id)
  }

  return {
    meta: { seedVersion: SEED_VERSION, seededAt: now.toISOString() },
    orgs: seedOrgs(now),
    users: seedUsers(),
    memberships: seedMemberships(now),
    invites: seedInvites(now),
    resetTokens: [],
    notifications,
    auditEvents: [...auditEvents, ...docs.audit],
    usage: [
      { orgId: 'org_3rdloop', month, askQuestions: 412 },
      { orgId: 'org_sample_clinic', month, askQuestions: 38 },
    ],
    documents: docs.documents,
    documentVersions: docs.versions,
    workflowEvents: docs.workflow,
    acknowledgements: docs.acknowledgements,
    controls,
  }
}
