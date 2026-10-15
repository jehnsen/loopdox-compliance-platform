import type {
  AccessGrant,
  AccessLevel,
  AccessReview,
  AccessReviewItem,
  AuditEvent,
  Change,
  Control,
  Decision,
  Evidence,
  Risk,
  Score,
  SecretRecord,
  System,
} from '@/lib/api/types'
import { addDaysToDate } from '@/lib/privacy'
import { nextRotationDate, periodEnd, periodOf, previousPeriod } from '@/lib/security'
import { todayInTz } from '@/lib/utils/dates'

/**
 * Security seed (section 6.2): 25 access grants, a signed-off review for last quarter and
 * one in progress, 8 secret records (two overdue), 15 changes (three emergency), 12 risks,
 * 4 ADRs. All people and vendors are fictional.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR
const ORG = 'org_3rdloop'

export interface SecuritySeed {
  accessGrants: AccessGrant[]
  accessReviews: AccessReview[]
  secrets: SecretRecord[]
  changes: Change[]
  risks: Risk[]
  decisions: Decision[]
  evidence: Evidence[]
  audit: AuditEvent[]
}

export function seedSecurity(now: Date, systems: System[], controls: Control[]): SecuritySeed {
  const tz = 'Asia/Manila'
  const today = todayInTz(tz, now)
  const day = (offset: number) => addDaysToDate(today, offset)
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const sysName = (id: string) => systems.find((s) => s.id === id)?.name ?? id

  const base = (id: string, daysAgo: number, by = 'usr_jehnsen') => ({
    id,
    orgId: ORG,
    createdAt: ago(daysAgo * DAY),
    updatedAt: ago(daysAgo * DAY),
    createdBy: by,
    updatedBy: by,
    version: 1,
    sample: true as const,
  })

  const currentPeriod = periodOf(today)
  const lastPeriod = previousPeriod(currentPeriod)
  // The last review was signed off five days before its quarter ended.
  const lastReviewDate = addDaysToDate(periodEnd(lastPeriod), -5)
  const lastReviewAt = new Date(`${lastReviewDate}T09:30:00+08:00`).toISOString()

  // -------------------------------------------------------------------------
  // Access grants (25 active)
  // -------------------------------------------------------------------------
  const RAMIL = 'Ramil Torres (contractor)'
  const DINA = 'Dina Cruz (web freelancer)'
  const SAHOD = 'Sahod Payroll Services support'
  const grant = (
    n: number,
    systemId: string,
    who: { userId: string } | { externalName: string },
    level: AccessLevel,
    grantedDaysAgo: number,
    approvedBy = 'usr_jehnsen',
  ): AccessGrant => {
    const grantedAt = day(-grantedDaysAgo)
    return {
      ...base(`grant_${String(n).padStart(3, '0')}`, grantedDaysAgo),
      systemId,
      userId: 'userId' in who ? who.userId : null,
      externalName: 'externalName' in who ? who.externalName : null,
      level,
      approvedBy,
      grantedAt,
      // Reviewed last quarter, unless the grant is newer than that review.
      lastReviewedAt: grantedAt < lastReviewDate ? lastReviewDate : null,
      status: 'active',
      revokedAt: null,
      notes: '',
    }
  }
  const J = { userId: 'usr_jehnsen' }
  const M = { userId: 'usr_michael' }
  const S = { userId: 'usr_staff' }
  const grants: AccessGrant[] = [
    grant(1, 'sys_github', J, 'owner', 380),
    grant(2, 'sys_github', M, 'read', 300),
    grant(3, 'sys_github', S, 'write', 200),
    grant(4, 'sys_github', { externalName: RAMIL }, 'write', 150),
    grant(5, 'sys_github', { externalName: 'Kuya Dev Studio (vendor)' }, 'read', 120),
    grant(6, 'sys_azure_prod', J, 'owner', 380),
    grant(7, 'sys_azure_prod', M, 'read', 300),
    grant(8, 'sys_azure_prod', { externalName: RAMIL }, 'admin', 150),
    grant(9, 'sys_db_prod', J, 'admin', 380),
    grant(10, 'sys_db_prod', { externalName: RAMIL }, 'read', 150),
    grant(11, 'sys_keyvault', J, 'owner', 380),
    grant(12, 'sys_workspace', J, 'owner', 380),
    grant(13, 'sys_workspace', M, 'admin', 380, 'usr_michael'),
    grant(14, 'sys_workspace', S, 'write', 200),
    grant(15, 'sys_hostinger', J, 'owner', 380),
    grant(16, 'sys_hostinger', { externalName: DINA }, 'admin', 260),
    grant(17, 'sys_domain', J, 'owner', 380),
    grant(18, 'sys_domain', M, 'admin', 380, 'usr_michael'),
    grant(19, 'sys_payroll', M, 'owner', 380, 'usr_michael'),
    grant(20, 'sys_payroll', J, 'read', 300),
    grant(21, 'sys_payroll', { externalName: SAHOD }, 'read', 300),
    grant(22, 'sys_mailer', J, 'admin', 300),
    grant(23, 'sys_mailer', S, 'write', 120),
    grant(24, 'sys_nas', J, 'admin', 380),
    grant(25, 'sys_nas', S, 'write', 380),
  ]
  const personName = (g: AccessGrant) =>
    g.externalName ??
    { usr_jehnsen: 'Jehnsen Enrique', usr_michael: 'Michael Manabat', usr_staff: 'Staff Member' }[
      g.userId ?? ''
    ] ??
    'Unknown'

  // -------------------------------------------------------------------------
  // Access reviews: last quarter signed off, this quarter in progress
  // -------------------------------------------------------------------------
  const item = (
    g: AccessGrant,
    decision: AccessReviewItem['decision'],
    note = '',
    newLevel: AccessLevel | null = null,
    at = ago(2 * DAY),
  ): AccessReviewItem => ({
    grantId: g.id,
    systemId: g.systemId,
    systemName: sysName(g.systemId),
    personName: personName(g),
    level: g.level,
    decision,
    note,
    newLevel,
    decidedBy: decision ? 'usr_jehnsen' : null,
    decidedAt: decision ? at : null,
  })
  const ofSystems = (ids: string[]) => grants.filter((g) => ids.includes(g.systemId))

  const lastSystems = [
    'sys_github',
    'sys_azure_prod',
    'sys_db_prod',
    'sys_keyvault',
    'sys_workspace',
  ]
  const lastReview: AccessReview = {
    ...base(`ar_${lastPeriod.toLowerCase().replace('-', '_')}`, 40),
    createdAt: ago(DAY * 40),
    updatedAt: lastReviewAt,
    ref: 'AR-001',
    period: lastPeriod,
    dueAt: periodEnd(lastPeriod),
    systemIds: lastSystems,
    reviewer: 'usr_jehnsen',
    items: ofSystems(lastSystems).map((g) => item(g, 'keep', '', null, lastReviewAt)),
    status: 'signed_off',
    signedOffAt: lastReviewAt,
    signedOffBy: 'usr_jehnsen',
    evidenceId: 'evd_access_review_1',
  }

  const thisSystems = ['sys_github', 'sys_azure_prod', 'sys_db_prod', 'sys_keyvault']
  const thisGrants = ofSystems(thisSystems)
  const decisions: Record<string, ReturnType<typeof item>> = {}
  const byId = (id: string): AccessGrant => {
    const g = grants.find((x) => x.id === id)
    if (!g) throw new Error(`Missing seed grant ${id}`)
    return g
  }
  for (const id of ['grant_001', 'grant_002', 'grant_003', 'grant_006']) {
    decisions[id] = item(byId(id), 'keep')
  }
  decisions.grant_004 = item(
    byId('grant_004'),
    'change',
    'The engagement moved to review work. Pull requests only.',
    'read',
  )
  decisions.grant_008 = item(
    byId('grant_008'),
    'revoke',
    'Admin on the production subscription isn’t needed after the migration finished.',
  )
  const thisReview: AccessReview = {
    ...base(`ar_${currentPeriod.toLowerCase().replace('-', '_')}`, 3),
    ref: 'AR-002',
    period: currentPeriod,
    dueAt: periodEnd(currentPeriod),
    systemIds: thisSystems,
    reviewer: 'usr_jehnsen',
    items: thisGrants.map((g) => decisions[g.id] ?? item(g, null)),
    status: 'in_progress',
    signedOffAt: null,
    signedOffBy: null,
    evidenceId: null,
  }

  // -------------------------------------------------------------------------
  // Evidence from last quarter's sign-off
  // -------------------------------------------------------------------------
  const accessControl = controls.find((c) => c.reference === 'A.5.15')
  const evidence: Evidence[] = accessControl
    ? [
        {
          ...base('evd_access_review_1', 40),
          createdAt: lastReviewAt,
          updatedAt: lastReviewAt,
          controlId: accessControl.id,
          source: 'manual',
          connectorId: null,
          collectedAt: lastReviewAt,
          result: 'pass',
          summary: `Access review ${lastPeriod} signed off: ${lastReview.items.length} grants on ${lastSystems.length} systems reviewed, ${lastReview.items.length} kept, 0 revoked, 0 changed.`,
          fileId: null,
          origin: {
            type: 'access_review',
            id: lastReview.id,
            label: `AR-001 Access review ${lastPeriod}`,
          },
        },
      ]
    : []

  // -------------------------------------------------------------------------
  // Secret records: where each lives, never the value
  // -------------------------------------------------------------------------
  const secret = (
    n: number,
    name: string,
    location: string,
    systemId: string | null,
    rotationDays: number,
    rotatedDaysAgo: number,
    notes = '',
  ): SecretRecord => {
    const lastRotatedAt = day(-rotatedDaysAgo)
    return {
      ...base(`scr_${String(n).padStart(3, '0')}`, rotatedDaysAgo),
      ref: `SCR-${String(n).padStart(3, '0')}`,
      name,
      location,
      systemId,
      owner: 'usr_jehnsen',
      lastRotatedAt,
      rotationDays,
      nextDueAt: nextRotationDate(lastRotatedAt, rotationDays),
      notes,
    }
  }
  const secrets: SecretRecord[] = [
    secret(1, 'PostgreSQL admin password', 'Azure Key Vault: kv-prod', 'sys_db_prod', 90, 30),
    secret(
      2,
      'GitHub Actions deploy token',
      'GitHub: repository secrets',
      'sys_github',
      180,
      200,
      'Used by the production deploy workflow.',
    ),
    secret(
      3,
      'Azure service principal secret',
      'Azure Key Vault: kv-prod',
      'sys_azure_prod',
      180,
      100,
    ),
    secret(
      4,
      'Google Workspace super admin recovery codes',
      '1Password vault: Infrastructure',
      'sys_workspace',
      365,
      300,
    ),
    secret(
      5,
      'Hostinger SFTP password',
      '1Password vault: Web',
      'sys_hostinger',
      90,
      120,
      'Shared with the web freelancer while the site is maintained.',
    ),
    secret(6, 'Domain registrar login', '1Password vault: Infrastructure', 'sys_domain', 365, 200),
    secret(7, 'Newsletter mailer API key', 'Azure Key Vault: kv-prod', 'sys_mailer', 180, 170),
    secret(8, 'Payroll service API token', 'Azure Key Vault: kv-prod', 'sys_payroll', 180, 60),
  ]

  // -------------------------------------------------------------------------
  // Changes (15, three emergency)
  // -------------------------------------------------------------------------
  const change = (
    n: number,
    source: Change['source'],
    systemId: string,
    summary: string,
    hoursAgo: number,
    opts: Partial<Change> = {},
  ): Change => ({
    ...base(`chg_${String(n).padStart(3, '0')}`, hoursAgo / 24),
    ref: `CHG-${String(n).padStart(3, '0')}`,
    source,
    externalUrl:
      source === 'github_pr'
        ? `https://github.com/3rdloop-example/platform/pull/${100 + n}`
        : source === 'deploy'
          ? `https://github.com/3rdloop-example/platform/actions/runs/${9000 + n}`
          : null,
    systemId,
    summary,
    approver: 'usr_michael',
    deployedAt: ago(hoursAgo * HOUR),
    rollbackPlan: 'Revert the commit and redeploy the previous release.',
    emergency: false,
    reviewNote: null,
    reviewedAt: null,
    reviewedBy: null,
    ...opts,
  })
  const changes: Change[] = [
    change(1, 'github_pr', 'sys_github', 'Require two reviewers on the main branch', 24 * 90),
    change(2, 'deploy', 'sys_azure_prod', 'Release 2.14: client portal export fix', 24 * 70, {
      approver: 'usr_jehnsen',
    }),
    change(
      3,
      'manual',
      'sys_workspace',
      'Turn on the external-recipient warning in Gmail',
      24 * 46,
      {
        rollbackPlan: 'Turn the setting off in the Admin console.',
      },
    ),
    change(4, 'github_pr', 'sys_github', 'Add dependency scanning to the CI pipeline', 24 * 41),
    change(5, 'deploy', 'sys_azure_prod', 'Release 2.15: audit trail for record edits', 24 * 33, {
      approver: 'usr_jehnsen',
    }),
    change(6, 'manual', 'sys_db_prod', 'Rotate the PostgreSQL admin password', 24 * 30, {
      rollbackPlan: 'Restore the previous password from Key Vault version history.',
    }),
    change(7, 'github_pr', 'sys_github', 'Remove unused admin team from the organisation', 24 * 27),
    change(8, 'deploy', 'sys_azure_prod', 'Release 2.16: faster client search', 24 * 19, {
      approver: 'usr_jehnsen',
    }),
    change(
      9,
      'manual',
      'sys_azure_prod',
      'Hotfix: disable public access on the backup storage container',
      24 * 12,
      {
        emergency: true,
        approver: 'usr_michael',
        rollbackPlan: 'Re-enable the container’s public access setting if a client link breaks.',
        reviewNote:
          'Reviewed the access logs and the fix. Confirmed the container is private and added an Azure Policy that blocks public containers.',
        reviewedAt: ago(24 * 11 * HOUR),
        reviewedBy: 'usr_jehnsen',
      },
    ),
    change(10, 'github_pr', 'sys_github', 'Pin third-party actions to commit hashes', 24 * 9),
    change(11, 'deploy', 'sys_azure_prod', 'Release 2.17: DSR export format', 24 * 6, {
      approver: 'usr_jehnsen',
    }),
    change(
      12,
      'deploy',
      'sys_azure_prod',
      'Emergency rollback of release 2.17 after a failed migration',
      24 * 5,
      {
        emergency: true,
        approver: null,
        rollbackPlan: 'Redeploy 2.17 once the migration script is fixed.',
      },
    ),
    change(
      13,
      'github_pr',
      'sys_github',
      'Fix the migration script for client project tables',
      24 * 4,
    ),
    change(14, 'manual', 'sys_hostinger', 'Update the contact form to log consent', 24 * 2, {
      approver: 'usr_michael',
    }),
    change(
      15,
      'deploy',
      'sys_azure_prod',
      'Emergency patch: rate limiting on the public login endpoint',
      20,
      {
        emergency: true,
        approver: 'usr_michael',
        rollbackPlan: 'Raise the limit back to its previous value in the gateway settings.',
      },
    ),
  ]

  // -------------------------------------------------------------------------
  // Risks (12)
  // -------------------------------------------------------------------------
  const docId = (n: number) => `doc_itd_${String(n).padStart(3, '0')}`
  const ctl = (key: string) => `ctl_${key}`
  const risk = (
    n: number,
    title: string,
    description: string,
    likelihood: Score,
    impact: Score,
    treatment: Risk['treatment'],
    residual: [Score, Score] | null,
    reviewInDays: number,
    links: { docs?: number[]; controls?: string[] } = {},
    status: Risk['status'] = 'open',
  ): Risk => ({
    ...base(`risk_${String(n).padStart(3, '0')}`, 120 - n * 5),
    ref: `RISK-${String(n).padStart(3, '0')}`,
    title,
    description,
    likelihood,
    impact,
    inherentScore: likelihood * impact,
    treatment,
    residualLikelihood: residual?.[0] ?? null,
    residualImpact: residual?.[1] ?? null,
    residualScore: residual ? residual[0] * residual[1] : null,
    owner: 'usr_jehnsen',
    documentIds: (links.docs ?? []).map(docId),
    controlIds: (links.controls ?? []).map(ctl),
    reviewAt: day(reviewInDays),
    status,
  })
  const risks: Risk[] = [
    risk(
      1,
      'Unauthorised access to production client data',
      'Someone without a business need reaches the production database or storage.',
      3,
      5,
      'mitigate',
      [2, 5],
      60,
      { docs: [7, 6], controls: ['a_5_15', 'a_5_18'] },
    ),
    risk(
      2,
      'Backups are lost or can’t be restored',
      'A failure or deletion with no restorable copy.',
      2,
      4,
      'mitigate',
      [1, 4],
      90,
      { docs: [13, 16] },
    ),
    risk(
      3,
      'Phishing leads to stolen credentials',
      'A staff member enters their password on a fake sign-in page.',
      4,
      4,
      'mitigate',
      [3, 3],
      45,
      { docs: [8, 7], controls: ['a_5_17'] },
    ),
    risk(
      4,
      'A payroll or mailer vendor suffers a breach',
      'Personal data held by a service provider is exposed.',
      3,
      4,
      'transfer',
      [3, 3],
      120,
      { docs: [14] },
    ),
    risk(
      5,
      'Unpatched dependencies reach production',
      'A known vulnerability in a library ships to clients.',
      4,
      3,
      'mitigate',
      [2, 3],
      30,
      { docs: [10] },
    ),
    risk(
      6,
      'A misconfigured storage container exposes data',
      'A cloud storage setting is left public, as happened with INC-0003.',
      3,
      5,
      'mitigate',
      [2, 5],
      20,
      { docs: [6, 11] },
    ),
    risk(
      7,
      'Key person dependency on the CTO',
      'Infrastructure knowledge sits with one person.',
      3,
      3,
      'accept',
      null,
      180,
    ),
    risk(
      8,
      'Personal data sent to an AI tool without controls',
      'Staff paste client data into a public AI service.',
      3,
      4,
      'mitigate',
      [2, 3],
      60,
      { docs: [15] },
    ),
    risk(
      9,
      'A laptop is lost or stolen',
      'A device with client exports leaves the office unprotected.',
      3,
      3,
      'mitigate',
      [2, 2],
      200,
      { docs: [9] },
      'closed',
    ),
    risk(
      10,
      'Ransomware encrypts the office file server',
      'Malware locks the shared drive.',
      2,
      5,
      'mitigate',
      [1, 5],
      75,
      { docs: [13, 16] },
    ),
    risk(
      11,
      'The NPC registration lapses',
      'Renewal is missed and the organisation processes data unregistered.',
      2,
      3,
      'avoid',
      [1, 3],
      100,
      { docs: [4] },
    ),
    risk(
      12,
      'Teams adopt SaaS tools without review',
      'Unapproved services start holding company data.',
      4,
      2,
      'accept',
      null,
      -12,
    ),
  ]

  // -------------------------------------------------------------------------
  // Decisions (ADRs)
  // -------------------------------------------------------------------------
  const adr = (
    n: number,
    title: string,
    context: string,
    decision: string,
    consequences: string,
    status: Decision['status'],
    daysAgo: number,
    systemIds: string[],
    links: Pick<Decision, 'supersededBy' | 'supersedes'> = { supersededBy: null, supersedes: null },
  ): Decision => ({
    ...base(`adr_${String(n).padStart(3, '0')}`, daysAgo),
    ref: `ADR-${String(n).padStart(3, '0')}`,
    title,
    context,
    decision,
    consequences,
    status,
    decidedBy: n === 2 ? 'usr_jehnsen' : 'usr_michael',
    decidedAt: day(-daysAgo),
    systemIds,
    ...links,
  })
  const decisions2: Decision[] = [
    adr(
      1,
      'Keep application secrets in Azure Key Vault',
      'Secrets were scattered across environment files and a shared password manager. We needed one place with access control and an audit trail, and rotation that doesn’t need a redeploy.',
      'Application secrets live in Azure Key Vault (kv-prod). Services read them through managed identities. Humans only get break-glass access.',
      'One place to review and rotate. Local development needs a separate dev vault. The secrets tracker records where each secret lives, never its value.',
      'accepted',
      340,
      ['sys_keyvault', 'sys_azure_prod'],
    ),
    adr(
      2,
      'Give each large client their own database',
      'A shared database makes it hard to prove that one client’s data can’t reach another’s, and complicates deletion requests.',
      'Clients above a size threshold get a dedicated PostgreSQL database. Smaller clients stay on the shared cluster with row-level isolation.',
      'Cleaner deletion and export for data subject requests, at a higher hosting cost. Migrations must run per database.',
      'proposed',
      6,
      ['sys_db_prod'],
    ),
    adr(
      3,
      'Host the marketing website on shared hosting',
      'The website is a few static pages and a contact form. A managed cloud setup seemed excessive.',
      'Keep the website on Hostinger shared hosting.',
      'Cheap and simple, but patching and access depend on the host, and the contact form stores enquiries on a shared server.',
      'superseded',
      280,
      ['sys_hostinger'],
      { supersededBy: 'adr_004', supersedes: null },
    ),
    adr(
      4,
      'Move the marketing website to Azure Static Web Apps',
      'The contact form collects personal data, and the shared host can’t give us audit logs or enforce who deploys. ADR-003 no longer fits.',
      'Serve the website from Azure Static Web Apps, deployed from GitHub, with the contact form posting to an Azure Function that writes to the production database.',
      'Deployments are reviewed and logged. Hosting moves under our Azure subscription, and the Hostinger account can be closed after the cutover.',
      'accepted',
      60,
      ['sys_hostinger', 'sys_azure_prod', 'sys_github'],
      { supersededBy: null, supersedes: 'adr_003' },
    ),
  ]

  const audit: AuditEvent[] = [
    {
      id: 'aud_seed_ar_signed',
      orgId: ORG,
      actor: { id: 'usr_jehnsen', name: 'Jehnsen Enrique' },
      action: 'access_review.signed_off',
      targetType: 'access_review',
      targetId: lastReview.id,
      targetLabel: `AR-001 Access review ${lastPeriod}`,
      at: lastReviewAt,
      details: { period: lastPeriod, kept: lastReview.items.length, revoked: 0, changed: 0 },
    },
  ]

  return {
    accessGrants: grants,
    accessReviews: [lastReview, thisReview],
    secrets,
    changes,
    risks,
    decisions: decisions2,
    evidence,
    audit,
  }
}
