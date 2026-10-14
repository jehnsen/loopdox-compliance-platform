/**
 * Seed policy bodies. Each clause can say which version introduced it (`since`)
 * and what it said in earlier versions (`was`), so every seeded version renders
 * real Markdown and the History tab shows real diffs.
 *
 * Sample text for demonstration; it is not legal advice.
 */

export type Clause =
  | string
  | {
      text: string
      /** First version that contains the clause. */
      since?: number
      /** Earlier wording: key = last version that used it. */
      was?: Record<number, string>
    }

export interface PolicyContent {
  purpose: Clause
  scope: Clause
  statements: { heading: string; since?: number; items: Clause[] }[]
  roles: Clause[]
  related: string[]
  /** One entry per version, oldest first. */
  versions: { summary: string; author?: string }[]
}

export function clauseAt(clause: Clause, version: number): string | null {
  if (typeof clause === 'string') return clause
  if (clause.since && clause.since > version) return null
  if (clause.was) {
    const keys = Object.keys(clause.was)
      .map(Number)
      .filter((k) => k >= version)
      .sort((a, b) => a - b)
    const key = keys[0]
    if (key !== undefined) return clause.was[key] ?? clause.text
  }
  return clause.text
}

export function renderPolicyBody(
  content: PolicyContent,
  version: number,
  cycleMonths: number,
): string {
  const out: string[] = []
  const push = (s: string) => out.push(s)
  const items = (list: Clause[]) =>
    list
      .map((c) => clauseAt(c, version))
      .filter((t): t is string => t !== null)
      .map((t) => `- ${t}`)
      .join('\n')

  push('## 1. Purpose\n')
  push(`${clauseAt(content.purpose, version) ?? ''}\n`)
  push('## 2. Scope\n')
  push(`${clauseAt(content.scope, version) ?? ''}\n`)
  push('## 3. Policy statements\n')
  let n = 0
  for (const s of content.statements) {
    if (s.since && s.since > version) continue
    n += 1
    push(`### 3.${n} ${s.heading}\n`)
    push(`${items(s.items)}\n`)
  }
  push('## 4. Roles and responsibilities\n')
  push(`${items(content.roles)}\n`)
  push('## 5. Compliance and exceptions\n')
  push(
    'Breaches of this policy may lead to disciplinary action under the Code of Conduct ([[ITD-002]]). ' +
      'Exceptions must be requested in writing, approved by the policy owner and the CTO, recorded in the risk register, and reviewed at least every six months.\n',
  )
  if (content.related.length) {
    push('## 6. Related documents\n')
    push(`${content.related.map((id) => `- [[${id}]]`).join('\n')}\n`)
  }
  push(`## ${content.related.length ? 7 : 6}. Review\n`)
  push(
    `The owner reviews this policy at least every ${cycleMonths} months, and sooner after a significant incident, an audit finding, or a change in law or NPC issuances.`,
  )
  return out.join('\n')
}

const J = 'usr_jehnsen'
const M = 'usr_michael'

export const POLICY_CONTENT: Record<string, PolicyContent> = {
  'ITD-001': {
    purpose:
      'Set out how 3rdLoop creates, approves, publishes, reviews and retires controlled documents so that everyone works from the current approved version.',
    scope:
      'All policies, procedures and standards that 3rdLoop maintains in LoopDox, and anyone who writes, approves or relies on them.',
    statements: [
      {
        heading: 'Identification',
        items: [
          'Every controlled document has a unique ID (for example ITD-006), a title, an owner and a version number.',
          { text: 'IDs are never reused, even after a document is retired.', since: 2 },
        ],
      },
      {
        heading: 'Approval and publication',
        items: [
          'Policies require approval by the Chairman & CEO or a delegated approver before they take effect.',
          {
            text: 'A new version takes effect on the date it is approved. The previous approved version remains on record.',
            was: { 1: 'A new version takes effect when it is published on the shared drive.' },
          },
          {
            text: 'Approvers must not approve a document they wrote unless no other approver is available, and must record why.',
            since: 3,
          },
        ],
      },
      {
        heading: 'Review and retirement',
        items: [
          {
            text: 'Owners review each policy at least every 12 months; high-risk policies every 6 months.',
            was: { 2: 'Owners review each policy at least every 24 months.' },
          },
          'Retired documents stay readable in LoopDox for at least five years.',
        ],
      },
    ],
    roles: [
      'Document owners keep their documents accurate and start reviews on time.',
      'Approvers check that changes are justified and consistent with other policies.',
      'All staff read and acknowledge the policies that apply to them.',
    ],
    related: ['ITD-002', 'ITD-016'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Never reuse IDs; move publication into LoopDox.' },
      { summary: 'Shorten review cycle to 12 months; add self-approval rule.' },
    ],
  },

  'ITD-002': {
    purpose:
      'Describe the conduct expected of directors, officers and staff, and how the company is governed.',
    scope: 'Directors, officers, employees, interns and contractors of 3rdLoop Solutions Corp.',
    statements: [
      {
        heading: 'Integrity',
        items: [
          'Act honestly and in the best interests of clients and the company.',
          'Declare conflicts of interest to the Chairman & CEO before taking part in a related decision.',
          {
            text: 'Do not accept gifts or hospitality worth more than ₱5,000 from a client or supplier without written approval.',
            since: 2,
          },
        ],
      },
      {
        heading: 'Confidentiality',
        items: [
          'Keep client information confidential during and after employment.',
          'Report suspected misconduct through the incident report form or directly to the Chairman & CEO; reports made in good faith are protected from retaliation.',
        ],
      },
    ],
    roles: [
      'The Board sets the tone and approves this code.',
      'Managers model the expected conduct and act on reports.',
      'Everyone follows this code and reports concerns.',
    ],
    related: ['ITD-008'],
    versions: [
      { summary: 'First issue.', author: M },
      { summary: 'Add gifts and hospitality threshold.', author: M },
    ],
  },

  'ITD-003': {
    purpose:
      'Establish how 3rdLoop identifies, assesses, treats and monitors information security and privacy risks.',
    scope:
      'All business processes, systems and suppliers that handle company or client information.',
    statements: [
      {
        heading: 'Assessment',
        items: [
          'Risks are scored on a 5×5 matrix of likelihood and impact.',
          { text: 'Inherent and residual scores are both recorded.', since: 2 },
          {
            text: 'Risks scoring 15 or more are reported to the Chairman & CEO within 5 working days.',
            was: { 2: 'Risks scoring 20 or more are reported to the Chairman & CEO.' },
          },
        ],
      },
      {
        heading: 'Treatment',
        items: [
          'Each risk has an owner and a treatment: mitigate, accept, transfer or avoid.',
          'Accepted risks above 12 need the Chairman & CEO’s written acceptance.',
          { text: 'Every risk is reviewed at least quarterly.', since: 3 },
        ],
      },
    ],
    roles: [
      'The CTO maintains the risk register.',
      'Risk owners carry out treatments and report progress.',
      'The Chairman & CEO accepts residual risk on behalf of the company.',
    ],
    related: ['ITD-006', 'ITD-014'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Record inherent and residual scores.' },
      { summary: 'Lower escalation threshold to 15; quarterly risk reviews.' },
    ],
  },

  'ITD-004': {
    purpose:
      'Explain how 3rdLoop processes personal data lawfully, fairly and transparently, in line with the Data Privacy Act of 2012 (RA 10173), its IRR and NPC issuances.',
    scope:
      'All personal data 3rdLoop processes as a personal information controller or processor, in any form.',
    statements: [
      {
        heading: 'Principles',
        items: [
          'Process personal data only for declared, specified and legitimate purposes (transparency, legitimate purpose, proportionality).',
          'Collect only the data needed for the purpose, and keep it accurate.',
          {
            text: 'Keep personal data only as long as the purpose requires, as set out in the retention schedule ([[ITD-016]]).',
            was: { 2: 'Keep personal data only as long as necessary.' },
          },
        ],
      },
      {
        heading: 'Records and assessments',
        items: [
          'Maintain a record of processing activities for every processing system.',
          {
            text: 'Complete a privacy impact assessment before starting any new processing of sensitive personal information.',
            since: 2,
          },
          {
            text: 'Register qualifying processing systems and the DPO with the NPC and keep the registration current.',
            since: 3,
          },
        ],
      },
      {
        heading: 'Data subject rights',
        since: 2,
        items: [
          'Respond to requests to access, correct, erase, object to or port personal data within the response period set in LoopDox (default 30 days).',
          'Verify the requester’s identity before disclosing any personal data.',
        ],
      },
      {
        heading: 'Breaches',
        since: 4,
        items: [
          'Report suspected personal data breaches immediately using “Report an incident”.',
          'The DPO decides whether NPC and data subject notification is required and, if so, notifies within 72 hours of knowledge.',
        ],
      },
    ],
    roles: [
      'The Data Protection Officer (DPO) oversees compliance and is the contact point for the NPC and data subjects.',
      'Process owners keep processing records and assessments current.',
      'All staff handle personal data according to this policy and complete annual privacy training.',
    ],
    related: ['ITD-005', 'ITD-012', 'ITD-014', 'ITD-016'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Add PIA requirement and data subject rights section.' },
      { summary: 'Add NPC registration requirement.' },
      { summary: 'Add breach section with the 72-hour notification rule.' },
    ],
  },

  'ITD-005': {
    purpose: 'Define how information is classified and how each class must be handled.',
    scope: 'All information created, received or stored by 3rdLoop, including client data.',
    statements: [
      {
        heading: 'Classes',
        items: [
          '**Public:** approved for release; no restrictions.',
          '**Internal:** for staff and contractors; low impact if disclosed.',
          '**Confidential:** client data and business-sensitive information; disclosure causes harm.',
          {
            text: '**Restricted:** sensitive personal information, credentials and keys; disclosure causes serious harm or breaches the Data Privacy Act.',
            was: { 1: '**Restricted:** credentials and keys.' },
          },
        ],
      },
      {
        heading: 'Handling',
        items: [
          'Owners assign a class when information is created; when unsure, use Confidential.',
          'Confidential and Restricted information is encrypted in transit and at rest.',
          {
            text: 'Restricted information is never sent by personal email or messaging apps.',
            since: 2,
          },
        ],
      },
    ],
    roles: [
      'Information owners classify their information.',
      'Everyone handles information according to its class.',
    ],
    related: ['ITD-004', 'ITD-006'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Include sensitive personal information in Restricted; ban personal channels.' },
    ],
  },

  'ITD-006': {
    purpose: {
      text: 'Set 3rdLoop’s direction and commitments for information security, so that the confidentiality, integrity and availability of company and client information are protected in line with ISO/IEC 27001:2022 and the security requirements of the Data Privacy Act of 2012.',
      was: {
        2: 'Set 3rdLoop’s direction and commitments for information security, so that company and client information is protected.',
      },
    },
    scope:
      'All information assets of 3rdLoop Solutions Corp., including client data we process, the systems and cloud services that store or process it, and everyone with access: employees, contractors and suppliers.',
    statements: [
      {
        heading: 'Leadership and commitment',
        items: [
          'Management sets information security objectives each year and reviews progress at least twice a year.',
          'Information security requirements are considered at the start of every project, not added at the end.',
          { text: 'Resources for security are planned in the annual budget.', since: 2 },
        ],
      },
      {
        heading: 'Access and authentication',
        items: [
          'Access follows least privilege and need to know, as set out in the Access Control Policy ([[ITD-007]]).',
          {
            text: 'Multi-factor authentication is required for all company accounts, including email, source control and cloud consoles.',
            was: { 2: 'Multi-factor authentication is required for administrator accounts.' },
          },
          {
            text: 'Access rights are reviewed every quarter, and removed within one working day of a role change or departure.',
            since: 3,
          },
        ],
      },
      {
        heading: 'Protecting information',
        items: [
          'Information is classified and handled according to the Data Classification & Handling Policy ([[ITD-005]]).',
          {
            text: 'Data classified Confidential or Restricted is encrypted in transit (TLS 1.2 or later) and at rest.',
            was: { 3: 'Sensitive data is encrypted.' },
          },
          'Secrets such as API keys and passwords live only in an approved secret store, never in source code or chat.',
          {
            text: 'Production data is not copied to development or test environments unless it is anonymised.',
            since: 4,
          },
        ],
      },
      {
        heading: 'Operations',
        items: [
          'Changes to production systems follow the Change Management Policy ([[ITD-011]]).',
          'Security patches rated critical are applied within 14 days; high within 30 days.',
          'Backups are taken and tested according to [[ITD-016]].',
          {
            text: 'Security-relevant logs are kept for at least 12 months and protected from tampering.',
            since: 3,
          },
        ],
      },
      {
        heading: 'Incidents and continuity',
        items: [
          'Anyone who suspects a security incident reports it immediately through “Report an incident”, following [[ITD-012]].',
          'Personal data breaches are assessed for NPC notification within 72 hours of knowledge.',
          'Critical services have tested recovery plans under [[ITD-013]].',
        ],
      },
      {
        heading: 'Suppliers and AI services',
        since: 4,
        items: [
          'Suppliers that handle our data are assessed before onboarding and bound by a data processing agreement ([[ITD-014]]).',
          'Use of AI services with company or client data follows [[ITD-015]] and goes through VisorShield.',
        ],
      },
    ],
    roles: [
      'The **Chairman & CEO** approves this policy and accepts residual risk.',
      'The **CTO** owns this policy, runs the information security programme and reports on it to management.',
      'The **DPO** advises on personal data protection and handles breach notification.',
      'Managers make sure their teams follow this policy.',
      '**Everyone** completes security awareness training each year and reports incidents without delay.',
    ],
    related: [
      'ITD-003',
      'ITD-005',
      'ITD-007',
      'ITD-011',
      'ITD-012',
      'ITD-013',
      'ITD-014',
      'ITD-015',
      'ITD-016',
    ],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Add budget commitment.' },
      { summary: 'MFA for all accounts; quarterly access reviews; log retention.' },
      {
        summary:
          'Align with ISO/IEC 27001:2022; add suppliers and AI services; ban production data in test.',
      },
    ],
  },

  'ITD-007': {
    purpose:
      'Control who can access 3rdLoop and client systems and information, and make sure access stays appropriate.',
    scope:
      'All accounts on company systems, cloud services, repositories and client environments we manage.',
    statements: [
      {
        heading: 'Granting access',
        items: [
          'Access is granted on request, approved by the system owner, and recorded in LoopDox.',
          {
            text: 'Privileged access (administrator, production database, cloud owner) needs CTO approval and is time-limited where the platform supports it.',
            was: { 2: 'Privileged access needs CTO approval.' },
          },
          'Shared accounts are not allowed, except break-glass accounts kept in the secret store.',
        ],
      },
      {
        heading: 'Authentication',
        items: [
          {
            text: 'Multi-factor authentication is mandatory on every account that supports it; phishing-resistant methods (passkeys or security keys) are required for privileged accounts.',
            was: {
              2: 'Multi-factor authentication is mandatory on every account that supports it.',
            },
          },
          'Passwords are at least 12 characters and stored in the company password manager.',
        ],
      },
      {
        heading: 'Reviews and removal',
        items: [
          'System owners review all access every quarter and record the result as an access review.',
          'Access is removed within one working day of departure.',
          {
            text: 'Access unused for 90 days is disabled automatically where the platform supports it.',
            since: 3,
          },
        ],
      },
    ],
    roles: [
      'System owners approve and review access to their systems.',
      'The CTO approves privileged access and signs off quarterly reviews.',
      'HR tells the CTO about joiners, movers and leavers on the day.',
    ],
    related: ['ITD-006', 'ITD-009'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Quarterly reviews recorded in LoopDox.' },
      {
        summary:
          'Phishing-resistant MFA for privileged accounts; time-limited admin access; disable dormant accounts.',
      },
    ],
  },

  'ITD-008': {
    purpose: 'Set the rules for using company devices, accounts, networks and information.',
    scope:
      'Everyone who uses 3rdLoop devices, accounts or networks, including personal devices used for work.',
    statements: [
      {
        heading: 'Devices',
        items: [
          'Work devices have full-disk encryption, a screen lock of 5 minutes or less, and automatic updates turned on.',
          {
            text: 'Personal devices may access company email and chat only through the managed apps, with a device passcode.',
            was: { 2: 'Personal devices may access company email.' },
          },
          'Lost or stolen devices are reported immediately as an incident.',
        ],
      },
      {
        heading: 'Accounts and information',
        items: [
          'Use company accounts only for company work.',
          'Do not install unapproved software or browser extensions on work devices.',
          {
            text: 'Do not paste client data, source code or credentials into public AI tools. Use the approved AI tools, which run through VisorShield.',
            since: 3,
          },
        ],
      },
    ],
    roles: [
      'Everyone follows these rules.',
      'The CTO maintains the list of approved software and AI tools.',
    ],
    related: ['ITD-005', 'ITD-015'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Managed apps on personal devices.' },
      { summary: 'Rules on public AI tools.' },
    ],
  },

  'ITD-009': {
    purpose:
      'Make sure 3rdLoop knows what information assets it has, who owns them and how they are protected.',
    scope: 'Hardware, cloud accounts, SaaS subscriptions, domains, repositories and databases.',
    statements: [
      {
        heading: 'Inventory',
        items: [
          'Every system is recorded in LoopDox with an owner, classification and whether it holds personal data.',
          {
            text: 'The inventory is reviewed every quarter alongside the access review.',
            was: { 1: 'The inventory is reviewed every year.' },
          },
        ],
      },
      {
        heading: 'Lifecycle',
        items: [
          'New systems are added before they hold company or client data.',
          'Decommissioned systems have their data deleted or returned, and the evidence recorded.',
        ],
      },
    ],
    roles: ['The CTO owns the inventory.', 'System owners keep their entries accurate.'],
    related: ['ITD-006', 'ITD-007'],
    versions: [{ summary: 'First issue.' }, { summary: 'Quarterly inventory review.' }],
  },

  'ITD-010': {
    purpose: 'Build security into how 3rdLoop designs, writes, tests and ships software.',
    scope:
      'All software we build for ourselves or for clients, and the pipelines that build and deploy it.',
    statements: [
      {
        heading: 'Design and code',
        items: [
          'Threats are considered in design for features that handle personal data or authentication.',
          'All changes are reviewed by someone other than the author through a pull request.',
          'Secrets are never committed; repositories run secret scanning.',
        ],
      },
      {
        heading: 'Dependencies and testing',
        items: [
          {
            text: 'Dependencies are scanned for known vulnerabilities on every pull request; critical findings block the merge.',
            since: 2,
          },
          'Automated tests run on every pull request.',
        ],
      },
    ],
    roles: [
      'Developers follow this policy.',
      'The CTO approves exceptions and owns the pipeline configuration.',
    ],
    related: ['ITD-006', 'ITD-011'],
    versions: [
      { summary: 'First draft.' },
      { summary: 'Add dependency scanning, as requested in review.' },
    ],
  },

  'ITD-011': {
    purpose:
      'Make sure changes to production systems are planned, approved, tested and reversible.',
    scope: 'Changes to production infrastructure, applications, configurations and DNS.',
    statements: [
      {
        heading: 'Standard changes',
        items: [
          'Every production change goes through a pull request or change record with an approver other than the author.',
          'Each change has a rollback plan.',
          {
            text: 'Changes are logged in LoopDox automatically from GitHub and deployments.',
            since: 2,
          },
        ],
      },
      {
        heading: 'Emergency changes',
        items: [
          {
            text: 'Emergency changes may be made without prior approval to restore service, but need a review note within 2 working days.',
            was: { 1: 'Emergency changes may be made without prior approval.' },
          },
        ],
      },
    ],
    roles: [
      'Change authors plan and document the change.',
      'Approvers check risk and rollback.',
      'The CTO reviews emergency changes.',
    ],
    related: ['ITD-006', 'ITD-010'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Log changes automatically; emergency review within 2 days.' },
    ],
  },

  'ITD-012': {
    purpose:
      'Make sure incidents are reported, contained and learned from, and that personal data breaches are notified on time.',
    scope:
      'All security incidents and personal data breaches affecting 3rdLoop or client data we process.',
    statements: [
      {
        heading: 'Reporting',
        items: [
          'Anyone can report an incident in LoopDox, from any page.',
          'Report first, investigate later: do not wait until you are sure.',
        ],
      },
      {
        heading: 'Triage and notification',
        items: [
          'The CTO triages within 4 hours and assigns severity.',
          {
            text: 'When personal data may be involved, the DPO decides whether notification is required. If it is, the NPC and affected data subjects are notified within 72 hours of knowledge, using the notice templates in LoopDox.',
            was: {
              1: 'When personal data is involved, the DPO informs the NPC.',
              2: 'When personal data may be involved, the DPO decides whether the NPC must be notified within 72 hours.',
            },
          },
          {
            text: 'Clients are told within 24 hours when their data is affected, or sooner if our agreement says so.',
            since: 2,
          },
        ],
      },
      {
        heading: 'After the incident',
        since: 3,
        items: [
          'Every high or critical incident has a post-incident review within 10 working days, with actions tracked as risks or policy changes.',
        ],
      },
    ],
    roles: [
      'Everyone reports incidents immediately.',
      'The CTO leads technical response.',
      'The DPO leads breach assessment and notification.',
      'The Chairman & CEO signs off breach notices.',
    ],
    related: ['ITD-004', 'ITD-006', 'ITD-013'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Client notification within 24 hours; 72-hour decision rule.' },
      { summary: 'Data subject notices and post-incident reviews.' },
    ],
  },

  'ITD-013': {
    purpose: 'Keep critical services running, or restore them quickly, after a disruption.',
    scope: 'Services our clients depend on and the internal systems needed to run them.',
    statements: [
      {
        heading: 'Planning',
        items: [
          'Each critical service has a documented recovery time objective (RTO) and recovery point objective (RPO).',
          { text: 'Recovery plans are stored outside the systems they recover.', since: 2 },
        ],
      },
      {
        heading: 'Testing',
        items: [
          {
            text: 'Recovery plans are tested at least once a year, and the result is recorded as evidence.',
            was: { 1: 'Recovery plans are tested when practical.' },
          },
        ],
      },
    ],
    roles: [
      'The CTO owns continuity planning.',
      'Service owners maintain and test their recovery plans.',
    ],
    related: ['ITD-012', 'ITD-016'],
    versions: [{ summary: 'First issue.' }, { summary: 'Annual testing; store plans off-system.' }],
  },

  'ITD-014': {
    purpose:
      'Manage the risks of suppliers and third parties who access our systems or process data for us.',
    scope: 'Suppliers, subcontractors and service providers, including cloud and AI providers.',
    statements: [
      {
        heading: 'Before onboarding',
        items: [
          'Assess the supplier’s security and privacy practices in proportion to the data they will handle.',
          {
            text: 'Sign a data processing or data sharing agreement before any personal data is shared, and record it in LoopDox.',
            was: { 1: 'Sign a data processing agreement where needed.' },
          },
        ],
      },
      {
        heading: 'During the relationship',
        items: [
          'Review critical suppliers every year.',
          'Renew or end agreements before they expire.',
        ],
      },
    ],
    roles: [
      'The DPO approves agreements involving personal data.',
      'Supplier owners manage the relationship and renewals.',
    ],
    related: ['ITD-003', 'ITD-004'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Agreements recorded in LoopDox before sharing data.' },
    ],
  },

  'ITD-015': {
    purpose:
      'Allow the responsible use of AI tools while protecting client data, personal data and the company.',
    scope: 'Any use of AI models or AI-powered features with company or client information.',
    statements: [
      {
        heading: 'Approved use',
        items: [
          'Only AI tools listed in the AI inventory may be used with company or client information.',
          {
            text: 'All AI calls with company data go through VisorShield, which masks personal data and blocks prohibited topics.',
            was: { 1: 'AI calls should go through VisorShield where possible.' },
          },
          { text: 'Each AI use case has a risk assessment before it goes live.', since: 2 },
        ],
      },
      {
        heading: 'Human oversight',
        since: 3,
        items: [
          'Outputs that affect clients, people’s rights or legal positions are reviewed by a person before use.',
          'High-risk use cases need sign-off from the DPO and the Chairman & CEO.',
        ],
      },
    ],
    roles: [
      'The CTO maintains the AI inventory and VisorShield profiles.',
      'The DPO reviews AI use cases involving personal data.',
    ],
    related: ['ITD-004', 'ITD-008', 'ITD-014'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Mandatory VisorShield; risk assessments per use case.' },
      { summary: 'Draft: add human oversight section.' },
    ],
  },

  'ITD-016': {
    purpose:
      'Make sure information can be recovered when needed and is disposed of securely when no longer needed.',
    scope: 'Company and client data in all systems, including backups.',
    statements: [
      {
        heading: 'Backup',
        items: [
          'Production databases are backed up daily and kept for 35 days.',
          {
            text: 'Backups are encrypted and stored in a separate account from production.',
            since: 2,
          },
          'A restore is tested every quarter.',
        ],
      },
      {
        heading: 'Retention and disposal',
        items: [
          'Personal data is kept only for the periods in the retention schedule.',
          {
            text: 'Data past its retention period is deleted within 30 days, and disposal of physical records uses cross-cut shredding.',
            was: { 1: 'Data past its retention period is deleted.' },
          },
        ],
      },
    ],
    roles: ['The CTO runs backups and restore tests.', 'Data owners apply the retention schedule.'],
    related: ['ITD-004', 'ITD-013'],
    versions: [
      { summary: 'First issue.' },
      { summary: 'Separate backup account; disposal timelines.' },
    ],
  },
}

export const SECTION_BODIES: Record<string, string> = {
  governance:
    'Policies that set how 3rdLoop is run: document control, conduct and governance, and risk management.\n\nEach policy below is owned, approved and reviewed under the Document Control Policy ([[ITD-001]]).',
  privacy:
    'How 3rdLoop protects personal data under the Data Privacy Act of 2012 (RA 10173), its IRR and NPC issuances.\n\nThe Data Protection Officer owns this section.',
  security:
    'The information security management system: the top-level policy ([[ITD-006]]) and the policies that support it.',
  operations: 'How systems are changed, recovered and kept running, and how incidents are handled.',
  ai: 'How 3rdLoop uses AI responsibly, with VisorShield as the control point for every AI call.',
}

export { J as SEED_AUTHOR_JEHNSEN, M as SEED_AUTHOR_MICHAEL }
