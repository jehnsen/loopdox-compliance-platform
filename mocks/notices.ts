import type { NoticeDraft, Org } from '@/lib/api/types'
import { formatDate, formatDateTimeZone } from '@/lib/utils/dates'
import type { MockDB, MockIncident } from '@/mocks/store'

/**
 * Pre-fills the NPC and data subject notices from the incident and the records it
 * links to: processing activities (data subjects, data categories), systems, the
 * NPC registration and the DPO on record. Bracketed text is for the DPO to complete.
 */

function list(items: string[], empty: string): string {
  return items.length ? items.join(', ') : empty
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}

/** "a, b and c" */
function prose(items: string[]): string {
  return items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

export interface NoticeContext {
  db: Pick<MockDB, 'processingActivities' | 'systems' | 'registrations' | 'users' | 'memberships'>
  org: Org
  incident: MockIncident
}

export function dpoOnRecord(ctx: NoticeContext): { name: string; email: string } {
  const reg = ctx.db.registrations.find((r) => r.orgId === ctx.org.id)
  if (reg) return { name: reg.dpoName, email: reg.dpoEmail }
  const member = ctx.db.memberships.find(
    (m) => m.orgId === ctx.org.id && m.status === 'active' && m.roles.includes('dpo'),
  )
  const user = ctx.db.users.find((u) => u.id === member?.userId)
  return user
    ? { name: user.name, email: user.email }
    : { name: '[DPO name]', email: '[DPO email]' }
}

export function draftNotices(ctx: NoticeContext): { npc: NoticeDraft; subjects: NoticeDraft } {
  const { db, org, incident } = ctx
  const tz = org.timezone
  const activities = db.processingActivities.filter(
    (p) => p.orgId === org.id && incident.processingActivityIds.includes(p.id),
  )
  const systems = db.systems.filter((s) => s.orgId === org.id && incident.systemIds.includes(s.id))
  const reg = db.registrations.find((r) => r.orgId === org.id)
  const dpo = dpoOnRecord(ctx)
  const reporter = db.users.find((u) => u.id === incident.reportedBy)?.name ?? 'a staff member'

  const subjects = unique(activities.flatMap((a) => a.dataSubjects))
  const categories = unique(activities.flatMap((a) => a.dataCategories.map((c) => c.name)))
  const sensitive = unique(
    activities.flatMap((a) => a.dataCategories.filter((c) => c.sensitive).map((c) => c.name)),
  )
  const affected =
    incident.affectedCount === null
      ? '[being determined]'
      : `about ${incident.affectedCount.toLocaleString('en-PH')}`
  const discovered = formatDateTimeZone(incident.discoveredAt, tz)
  const containment = incident.containedAt
    ? `The breach was contained on ${formatDateTimeZone(incident.containedAt, tz)}. [Describe the containment and recovery steps taken.]`
    : '[Describe the containment and recovery steps taken so far.]'

  const npc: NoticeDraft = {
    subject: `Personal data breach notification: ${org.name} (${incident.ref})`,
    body: [
      'To: National Privacy Commission',
      `From: ${org.name}`,
      `Registration: ${reg?.reference ?? '[registration reference]'}`,
      `Data protection officer: ${dpo.name}, ${dpo.email}`,
      '',
      '1. Nature of the breach',
      `${incident.title}. ${incident.description}`,
      `Discovered: ${discovered}. Reported internally by ${reporter}.`,
      `Affected, as first reported: ${incident.affectedSummary || '[describe]'}`,
      '',
      '2. Personal data involved',
      `Processing activities: ${list(
        activities.map((a) => `${a.ref} ${a.name}`),
        '[link the processing records involved]',
      )}`,
      `Data subjects: ${list(subjects, '[groups of people affected]')}`,
      `Personal data: ${list(categories, '[categories of personal data]')}`,
      `Sensitive personal information: ${list(sensitive, 'none identified')}`,
      `Number of data subjects affected: ${affected}`,
      `Systems involved: ${list(
        systems.map((s) => s.name),
        '[systems involved]',
      )}`,
      '',
      '3. Measures taken to address the breach',
      containment,
      '',
      '4. Measures to reduce harm to data subjects',
      '[Describe what you are doing, and what you advise data subjects to do.]',
      '',
      '5. Contact',
      `${dpo.name}, Data Protection Officer, ${dpo.email}`,
    ].join('\n'),
  }

  const subjectsNotice: NoticeDraft = {
    subject: `Important: an incident at ${org.name} may have affected your personal data`,
    body: [
      `Dear ${subjects.length ? prose(subjects).toLowerCase() : '[data subjects]'},`,
      '',
      `On ${formatDate(incident.discoveredAt, tz)}, ${org.name} discovered a security incident that may have affected your personal data.`,
      '',
      'What happened',
      incident.description,
      '',
      'What information was involved',
      `${list(categories, '[categories of personal data]')}.${
        sensitive.length
          ? ` This includes sensitive personal information: ${sensitive.join(', ')}.`
          : ''
      }`,
      '',
      'What we are doing',
      '[Describe the steps taken to contain the incident and protect your data.]',
      '',
      'What you can do',
      '[Practical steps, for example watching for suspicious messages or changing passwords.]',
      '',
      'For more information',
      `Contact our Data Protection Officer, ${dpo.name}, at ${dpo.email}.`,
      '',
      org.name,
    ].join('\n'),
  }

  return { npc, subjects: subjectsNotice }
}
