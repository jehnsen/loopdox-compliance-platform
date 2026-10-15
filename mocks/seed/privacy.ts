import type {
  Agreement,
  AuditEvent,
  DataFlowStage,
  Pia,
  PiaRisk,
  ProcessingActivity,
  Registration,
  TrainingRecord,
} from '@/lib/api/types'
import { notificationDeadline } from '@/lib/countdown'
import { addDaysToDate } from '@/lib/privacy'
import { overallScore } from '@/lib/risk'
import { todayInTz } from '@/lib/utils/dates'
import type { MockDsr, MockFile, MockIncident } from '@/mocks/store'

/**
 * Privacy seed (section 6.2): 6 processing records, 2 PIAs, 4 DSRs (one due in
 * 2 days), 2 incidents (one open breach whose 72-hour clock started 30 hours
 * ago), 5 agreements (one renewing within 30 days), 1 NPC registration and
 * training records. Sample Clinic gets a few records. All people are fictional.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR

export interface PrivacySeed {
  files: MockFile[]
  processingActivities: ProcessingActivity[]
  pias: Pia[]
  dsrs: MockDsr[]
  incidents: MockIncident[]
  agreements: Agreement[]
  registrations: Registration[]
  trainingRecords: TrainingRecord[]
  audit: AuditEvent[]
}

export function seedPrivacy(now: Date): PrivacySeed {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const today = todayInTz('Asia/Manila', now)
  const day = (offset: number) => addDaysToDate(today, offset)
  const year = Number(today.slice(0, 4))

  const base = (id: string, orgId: string, createdDaysAgo: number, by = 'usr_jehnsen') => ({
    id,
    orgId,
    createdAt: ago(createdDaysAgo * DAY),
    updatedAt: ago(createdDaysAgo * DAY),
    createdBy: by,
    updatedBy: by,
    version: 1,
    sample: true as const,
  })

  // -------------------------------------------------------------------------
  // Files (metadata only)
  // -------------------------------------------------------------------------
  const file = (
    id: string,
    orgId: string,
    name: string,
    size: number,
    daysAgo: number,
  ): MockFile => ({
    id,
    orgId,
    name,
    size,
    contentType: name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
    uploadedAt: ago(daysAgo * DAY),
    uploadedBy: 'usr_jehnsen',
  })
  const files: MockFile[] = [
    file('file_agr_001', 'org_3rdloop', 'Bayanihan Law Offices DPA (signed).pdf', 284_311, 337),
    file('file_agr_002', 'org_3rdloop', 'Sahod Payroll Services DPA.pdf', 196_022, 500),
    file('file_agr_004', 'org_3rdloop', 'Bantay Security Agency MSA.pdf', 412_870, 200),
    file('file_dsr_0012', 'org_3rdloop', 'Access request letter.pdf', 88_140, 28),
    file(
      'file_agr_sc_001',
      'org_sample_clinic',
      'Malinis Diagnostics data sharing agreement.pdf',
      150_400,
      90,
    ),
  ]

  // -------------------------------------------------------------------------
  // Processing records
  // -------------------------------------------------------------------------
  const pa = (
    id: string,
    orgId: string,
    ref: string,
    fields: Omit<
      ProcessingActivity,
      'id' | 'orgId' | 'ref' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'version'
    >,
  ): ProcessingActivity => ({ ...base(id, orgId, 200), ref, ...fields })

  const processingActivities: ProcessingActivity[] = [
    pa('pa_001', 'org_3rdloop', 'PA-001', {
      name: 'Employee records and payroll',
      purpose:
        'Manage employment, pay salaries, and file statutory contributions and taxes for employees.',
      legalBasis: 'legal_obligation',
      dataSubjects: ['Employees', 'Former employees'],
      dataCategories: [
        { name: 'Name and contact details', sensitive: false },
        { name: 'Government ID numbers (TIN, SSS, PhilHealth, Pag-IBIG)', sensitive: true },
        { name: 'Bank account details', sensitive: false },
        { name: 'Salary and benefits', sensitive: false },
      ],
      sources: 'Employees, during onboarding and when their details change.',
      recipients: [
        { name: 'Finance team', kind: 'internal' },
        { name: 'Sahod Payroll Services', kind: 'third_party' },
        { name: 'BIR, SSS, PhilHealth and Pag-IBIG', kind: 'authority' },
      ],
      crossBorder: { transfers: true, countries: ['Singapore'] },
      retention: '10 years after the employee leaves',
      systemIds: ['sys_payroll', 'sys_workspace'],
      agreementIds: ['agr_002'],
      owner: 'usr_jehnsen',
      status: 'approved',
    }),
    pa('pa_002', 'org_3rdloop', 'PA-002', {
      name: 'Client project delivery',
      purpose:
        'Build and support software for clients. This involves handling their staff’s and customers’ data in test, production and support work.',
      legalBasis: 'contract',
      dataSubjects: ['Client staff', 'Clients’ customers'],
      dataCategories: [
        { name: 'Name and contact details', sensitive: false },
        { name: 'Account and transaction records', sensitive: false },
        { name: 'Support tickets and call notes', sensitive: false },
        { name: 'Health information held in client systems', sensitive: true },
      ],
      sources: 'Client systems and client staff, under each client agreement.',
      recipients: [{ name: 'Delivery team', kind: 'internal' }],
      crossBorder: { transfers: false, countries: [] },
      retention: 'Returned or deleted within 30 days after the engagement ends',
      systemIds: ['sys_github', 'sys_azure_prod', 'sys_db_prod', 'sys_keyvault'],
      agreementIds: ['agr_001'],
      owner: 'usr_jehnsen',
      status: 'approved',
    }),
    pa('pa_003', 'org_3rdloop', 'PA-003', {
      name: 'Recruitment',
      purpose: 'Assess applicants for open roles and make job offers.',
      legalBasis: 'consent',
      dataSubjects: ['Job applicants'],
      dataCategories: [
        { name: 'Name and contact details', sensitive: false },
        { name: 'CV and work history', sensitive: false },
        { name: 'Education records', sensitive: true },
      ],
      sources: 'Applicants, job boards and employee referrals.',
      recipients: [{ name: 'Hiring managers', kind: 'internal' }],
      crossBorder: { transfers: false, countries: [] },
      retention: null,
      systemIds: ['sys_workspace'],
      agreementIds: [],
      owner: 'usr_jehnsen',
      status: 'draft',
    }),
    pa('pa_004', 'org_3rdloop', 'PA-004', {
      name: 'Website enquiries and newsletter',
      purpose: 'Answer enquiries from the website and send the monthly newsletter to subscribers.',
      legalBasis: 'consent',
      dataSubjects: ['Prospects', 'Newsletter subscribers'],
      dataCategories: [
        { name: 'Name', sensitive: false },
        { name: 'Email address', sensitive: false },
        { name: 'Company and role', sensitive: false },
      ],
      sources: 'Website contact form and event sign-up sheets.',
      recipients: [
        { name: 'Sales team', kind: 'internal' },
        { name: 'Liham Mailer Co.', kind: 'third_party' },
      ],
      crossBorder: { transfers: true, countries: ['United States'] },
      retention: 'Until the person unsubscribes, or 2 years without contact',
      systemIds: ['sys_hostinger', 'sys_mailer'],
      agreementIds: [],
      owner: 'usr_jehnsen',
      status: 'approved',
    }),
    pa('pa_005', 'org_3rdloop', 'PA-005', {
      name: 'IT security monitoring and access logs',
      purpose: 'Detect and investigate security events on company systems.',
      legalBasis: 'legitimate_interests',
      dataSubjects: ['Employees', 'Contractors'],
      dataCategories: [
        { name: 'Account identifiers', sensitive: false },
        { name: 'IP addresses and device details', sensitive: false },
        { name: 'Sign-in and audit logs', sensitive: false },
      ],
      sources: 'Company systems, automatically.',
      recipients: [{ name: 'IT security', kind: 'internal' }],
      crossBorder: { transfers: false, countries: [] },
      retention: '12 months',
      systemIds: ['sys_azure_prod', 'sys_github', 'sys_workspace', 'sys_keyvault'],
      agreementIds: [],
      owner: 'usr_jehnsen',
      status: 'approved',
    }),
    pa('pa_006', 'org_3rdloop', 'PA-006', {
      name: 'Office visitors and CCTV',
      purpose: 'Keep the office secure and know who is on the premises.',
      legalBasis: 'legitimate_interests',
      dataSubjects: ['Visitors'],
      dataCategories: [
        { name: 'Name and company', sensitive: false },
        { name: 'Government ID number shown at reception', sensitive: true },
        { name: 'CCTV images', sensitive: false },
      ],
      sources: 'Visitors at reception, and the office cameras.',
      recipients: [{ name: 'Bantay Security Agency', kind: 'third_party' }],
      crossBorder: { transfers: false, countries: [] },
      retention: '30 days for CCTV footage; 1 year for the visitor log',
      systemIds: ['sys_nas'],
      agreementIds: ['agr_004'],
      owner: 'usr_jehnsen',
      status: 'approved',
    }),
    pa('pa_sc_001', 'org_sample_clinic', 'PA-001', {
      name: 'Patient records',
      purpose: 'Provide consultations and keep the medical records the clinic must keep.',
      legalBasis: 'legal_obligation',
      dataSubjects: ['Patients'],
      dataCategories: [
        { name: 'Name and contact details', sensitive: false },
        { name: 'Medical history and diagnoses', sensitive: true },
        { name: 'PhilHealth number', sensitive: true },
      ],
      sources: 'Patients, at registration and during consultations.',
      recipients: [{ name: 'Malinis Diagnostics Laboratory', kind: 'third_party' }],
      crossBorder: { transfers: false, countries: [] },
      retention: '10 years after the last consultation',
      systemIds: [],
      agreementIds: ['agr_sc_001'],
      owner: 'usr_clinic_dpo',
      status: 'approved',
    }),
    pa('pa_sc_002', 'org_sample_clinic', 'PA-002', {
      name: 'Appointment booking and reminders',
      purpose: 'Book appointments and send reminders by text message.',
      legalBasis: 'consent',
      dataSubjects: ['Patients'],
      dataCategories: [
        { name: 'Name', sensitive: false },
        { name: 'Mobile number', sensitive: false },
      ],
      sources: 'Patients, by phone or at the front desk.',
      recipients: [{ name: 'SMS reminder provider', kind: 'third_party' }],
      crossBorder: { transfers: false, countries: [] },
      retention: '1 year',
      systemIds: [],
      agreementIds: [],
      owner: 'usr_clinic_dpo',
      status: 'approved',
    }),
  ]
  for (const p of processingActivities) {
    if (p.orgId === 'org_sample_clinic') p.createdBy = p.updatedBy = 'usr_clinic_dpo'
  }

  // -------------------------------------------------------------------------
  // Impact assessments
  // -------------------------------------------------------------------------
  const flows = (f: Partial<Record<DataFlowStage, string>>): Record<DataFlowStage, string> => ({
    collection: '',
    use: '',
    storage: '',
    sharing: '',
    disposal: '',
    ...f,
  })
  const risk = (
    id: string,
    description: string,
    likelihood: PiaRisk['likelihood'],
    impact: PiaRisk['impact'],
    mitigation = '',
  ): PiaRisk => ({ id, description, likelihood, impact, mitigation })

  const pia1Risks = [
    risk(
      'risk_a',
      'Production data is copied into test environments.',
      3,
      4,
      'Use masked or synthetic data in test. Block restores of production backups into test subscriptions.',
    ),
    risk(
      'risk_b',
      'Developers have broader access to production databases than they need.',
      3,
      3,
      'Just-in-time access through privileged identity management, and quarterly access reviews.',
    ),
    risk(
      'risk_c',
      'Client data is kept after an engagement ends.',
      2,
      3,
      'Offboarding checklist with deletion confirmed in writing to the client.',
    ),
  ]
  const pia2Risks = [
    risk('risk_d', 'Applicant CVs are shared in chat instead of the hiring folder.', 4, 2),
    risk('risk_e', 'Unsuccessful applicants’ data is kept indefinitely.', 4, 3),
  ]
  const pias: Pia[] = [
    {
      ...base('pia_001', 'org_3rdloop', 75),
      updatedAt: ago(60 * DAY),
      ref: 'PIA-001',
      processingActivityId: 'pa_002',
      scope:
        'Delivery of software projects that process client data: development, testing, production support and backups.',
      dataFlows: flows({
        collection:
          'Client data reaches us through client systems we are given access to, and through support tickets.',
        use: 'Developers and support engineers use it to build features, fix defects and answer tickets.',
        storage:
          'Stored in the Azure production subscription and the client project database, encrypted at rest.',
        sharing: 'Not shared outside the delivery team. Stays in the Philippines region.',
        disposal: 'Returned or deleted within 30 days after the engagement ends.',
      }),
      risks: pia1Risks,
      overallScore: overallScore(pia1Risks),
      decision: 'proceed_with_conditions',
      conditions: 'Masked test data in place for all new projects by the end of the quarter.',
      signedOffBy: 'usr_jehnsen',
      signedOffAt: ago(60 * DAY),
      status: 'signed_off',
      currentStep: 5,
    },
    {
      ...base('pia_002', 'org_3rdloop', 6),
      updatedAt: ago(2 * DAY),
      ref: 'PIA-002',
      processingActivityId: 'pa_003',
      scope: 'Recruitment from first application to offer, including referrals and job boards.',
      dataFlows: flows({
        collection: 'Applications arrive by email and from two job boards.',
        use: 'Hiring managers review CVs and interview notes.',
      }),
      risks: pia2Risks,
      overallScore: overallScore(pia2Risks),
      decision: null,
      conditions: null,
      signedOffBy: null,
      signedOffAt: null,
      status: 'in_progress',
      currentStep: 3,
    },
  ]

  // -------------------------------------------------------------------------
  // Data subject requests (dates are calendar days in Manila)
  // -------------------------------------------------------------------------
  const ev = (status: MockDsr['status'], daysAgo: number, note: string | null = null) => ({
    id: `dse_${status}_${daysAgo}`,
    status,
    at: ago(daysAgo * DAY),
    by: 'usr_jehnsen',
    note,
  })
  const dsr = (
    id: string,
    n: number,
    receivedDaysAgo: number,
    fields: Omit<
      MockDsr,
      | 'id'
      | 'orgId'
      | 'ref'
      | 'receivedAt'
      | 'dueAt'
      | 'createdAt'
      | 'updatedAt'
      | 'createdBy'
      | 'updatedBy'
      | 'version'
    >,
  ): MockDsr => ({
    ...base(id, 'org_3rdloop', receivedDaysAgo),
    ref: `DSR-${year}-${String(n).padStart(4, '0')}`,
    receivedAt: day(-receivedDaysAgo),
    dueAt: day(-receivedDaysAgo + 30),
    ...fields,
  })
  const dsrs: MockDsr[] = [
    dsr('dsr_2026_0009', 9, 75, {
      type: 'erasure',
      requester: { name: 'Ramon Villanueva', contact: 'ramon.v@mail.example' },
      channel: 'email',
      description:
        'Asked to be removed from the newsletter list and to have their enquiry history deleted.',
      identityVerified: true,
      assignee: 'usr_jehnsen',
      status: 'closed',
      outcome: 'granted',
      responseNotes: 'Deleted from the mailer and the enquiry inbox. Confirmation sent by email.',
      processingActivityIds: ['pa_004'],
      fileIds: [],
      events: [
        ev('received', 75),
        ev('identity_verified', 74, 'Replied from the subscribed address.'),
        ev('in_progress', 74),
        ev('responded', 70, 'Deletion confirmed.'),
        ev('closed', 69),
      ],
    }),
    dsr('dsr_2026_0010', 10, 40, {
      type: 'objection',
      requester: { name: 'Teresa Manalo', contact: '+63 917 555 0142' },
      channel: 'phone',
      description: 'Objected to receiving marketing calls after an event.',
      identityVerified: true,
      assignee: 'usr_jehnsen',
      status: 'responded',
      outcome: 'partially_granted',
      responseNotes:
        'Removed from call lists. Kept the event attendance record, which we need for the event’s accounting.',
      processingActivityIds: ['pa_004'],
      fileIds: [],
      events: [
        ev('received', 40),
        ev('identity_verified', 39),
        ev('in_progress', 39),
        ev('responded', 33, 'Explained what we keep and why.'),
      ],
    }),
    dsr('dsr_2026_0011', 11, 3, {
      type: 'correction',
      requester: { name: 'Paolo Garcia', contact: 'paolo.garcia@mail.example' },
      channel: 'web_form',
      description: 'Asked to correct the spelling of their surname and their mailing address.',
      identityVerified: false,
      assignee: null,
      status: 'received',
      outcome: null,
      responseNotes: '',
      processingActivityIds: ['pa_001'],
      fileIds: [],
      events: [ev('received', 3)],
    }),
    dsr('dsr_2026_0012', 12, 28, {
      type: 'access',
      requester: { name: 'Maria Clara Dela Cruz', contact: 'mcdelacruz@mail.example' },
      channel: 'email',
      description:
        'Asked for a copy of the personal data we hold about them as a customer of one of our clients.',
      identityVerified: true,
      assignee: 'usr_jehnsen',
      status: 'in_progress',
      outcome: null,
      responseNotes: 'Client informed as controller. Export from the support system in progress.',
      processingActivityIds: ['pa_002'],
      fileIds: ['file_dsr_0012'],
      events: [
        ev('received', 28),
        ev('identity_verified', 26, 'Verified against the client’s customer records.'),
        ev('in_progress', 25),
      ],
    }),
  ]

  // -------------------------------------------------------------------------
  // Incidents: one closed breach (notified) and one open breach, clock started 30 h ago
  // -------------------------------------------------------------------------
  const closedDiscovered = now.getTime() - 45 * DAY
  const at = (ms: number) => new Date(ms).toISOString()
  const incidents: MockIncident[] = [
    {
      ...base('inc_2026_0002', 'org_3rdloop', 45),
      updatedAt: at(closedDiscovered + 20 * DAY),
      ref: `INC-${year}-0002`,
      title: 'Payroll report emailed to the wrong recipient',
      description:
        'A payroll summary for 14 employees was emailed to an external address with a similar name. The recipient confirmed deletion the next day.',
      discoveredAt: at(closedDiscovered),
      reportedBy: 'usr_jehnsen',
      affectedSummary:
        'Payroll summary: names, salaries and government ID numbers of 14 employees.',
      severity: 'medium',
      personalDataInvolved: true,
      affectedCount: 14,
      processingActivityIds: ['pa_001'],
      systemIds: ['sys_workspace'],
      documentIds: ['doc_itd_008'],
      riskIds: [],
      notificationRequired: true,
      notificationRationale:
        'Government ID numbers are sensitive personal information and reached an outside party, so there is a real risk of serious harm.',
      notificationDeadline: notificationDeadline(at(closedDiscovered)),
      npcNotifiedAt: at(closedDiscovered + 50 * HOUR),
      npcReference: 'NPC-BN-0815',
      subjectsNotifiedAt: at(closedDiscovered + 60 * HOUR),
      containedAt: at(closedDiscovered + 26 * HOUR),
      closedAt: at(closedDiscovered + 20 * DAY),
      status: 'closed',
      postIncidentReview:
        'Root cause: email autocomplete picked an external contact. Actions: external-recipient warning turned on in Google Workspace; payroll reports now shared as links restricted to the finance team; ITD-008 updated to cover sending personal data by email.',
      notices: null, // drafted from linked records in seedDatabase
    },
    {
      ...base('inc_2026_0003', 'org_3rdloop', 0, 'usr_staff'),
      createdAt: ago(29 * HOUR),
      updatedAt: ago(20 * HOUR),
      updatedBy: 'usr_jehnsen',
      ref: `INC-${year}-0003`,
      title: 'Client database backup exposed in a public storage container',
      description:
        'A developer noticed that a storage container holding a nightly backup of a client project database allowed anonymous read access. Access logs are being reviewed to see whether anyone downloaded it.',
      discoveredAt: ago(30 * HOUR),
      reportedBy: 'usr_staff',
      affectedSummary:
        'One nightly backup of the client project database: customer names, contact details and support tickets.',
      severity: 'high',
      personalDataInvolved: true,
      affectedCount: null,
      processingActivityIds: ['pa_002'],
      systemIds: ['sys_azure_prod', 'sys_db_prod'],
      documentIds: [],
      riskIds: [],
      notificationRequired: null,
      notificationRationale: null,
      notificationDeadline: notificationDeadline(ago(30 * HOUR)),
      npcNotifiedAt: null,
      npcReference: null,
      subjectsNotifiedAt: null,
      containedAt: null,
      closedAt: null,
      status: 'triage',
      postIncidentReview: null,
      notices: null,
    },
  ]

  // -------------------------------------------------------------------------
  // Agreements
  // -------------------------------------------------------------------------
  const agr = (
    id: string,
    orgId: string,
    ref: string,
    fields: Omit<
      Agreement,
      'id' | 'orgId' | 'ref' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'version'
    >,
  ): Agreement => ({ ...base(id, orgId, 300), ref, ...fields })
  const agreements: Agreement[] = [
    agr('agr_001', 'org_3rdloop', 'AGR-001', {
      counterparty: 'Bayanihan Law Offices',
      type: 'dpa',
      role: 'we_are_processor',
      signedAt: day(-337),
      renewsAt: day(28),
      fileId: 'file_agr_001',
      owner: 'usr_jehnsen',
      notes: 'Covers support and hosting of the firm’s case management system.',
    }),
    agr('agr_002', 'org_3rdloop', 'AGR-002', {
      counterparty: 'Sahod Payroll Services',
      type: 'dpa',
      role: 'we_are_controller',
      signedAt: day(-500),
      renewsAt: day(230),
      fileId: 'file_agr_002',
      owner: 'usr_jehnsen',
      notes: '',
    }),
    agr('agr_003', 'org_3rdloop', 'AGR-003', {
      counterparty: 'Pagasa Multi-Purpose Cooperative',
      type: 'nda',
      role: 'we_are_processor',
      signedAt: day(-120),
      renewsAt: null,
      fileId: null,
      owner: 'usr_michael',
      notes: 'Pre-sales discussions. No personal data shared yet.',
    }),
    agr('agr_004', 'org_3rdloop', 'AGR-004', {
      counterparty: 'Bantay Security Agency',
      type: 'msa',
      role: 'we_are_controller',
      signedAt: day(-200),
      renewsAt: day(165),
      fileId: 'file_agr_004',
      owner: 'usr_jehnsen',
      notes: 'Reception and CCTV monitoring, including the visitor log.',
    }),
    agr('agr_005', 'org_3rdloop', 'AGR-005', {
      counterparty: 'Lakbay Travel Co.',
      type: 'data_sharing',
      role: 'we_are_controller',
      signedAt: day(-150),
      renewsAt: day(90),
      fileId: null,
      owner: 'usr_jehnsen',
      notes: 'Employee travel bookings for client visits.',
    }),
    agr('agr_sc_001', 'org_sample_clinic', 'AGR-001', {
      counterparty: 'Malinis Diagnostics Laboratory',
      type: 'data_sharing',
      role: 'we_are_controller',
      signedAt: day(-90),
      renewsAt: day(275),
      fileId: 'file_agr_sc_001',
      owner: 'usr_clinic_dpo',
      notes: '',
    }),
  ]

  // -------------------------------------------------------------------------
  // NPC registration
  // -------------------------------------------------------------------------
  const registrations: Registration[] = [
    {
      ...base('reg_3rdloop', 'org_3rdloop', 300),
      registrar: 'NPC',
      reference: 'NPC-REG-2025-04127',
      dpoName: 'Jehnsen Enrique',
      dpoEmail: 'dpo@3rdloop.example',
      registeredAt: day(-300),
      renewsAt: day(65),
      notes: 'Registered as a personal information controller and processor.',
    },
    {
      ...base('reg_sample_clinic', 'org_sample_clinic', 345, 'usr_clinic_dpo'),
      registrar: 'NPC',
      reference: 'NPC-REG-2025-09310',
      dpoName: 'Dra. Liza Santos',
      dpoEmail: 'liza.santos@sample-clinic.example',
      registeredAt: day(-345),
      renewsAt: day(20),
      notes: '',
    },
  ]

  // -------------------------------------------------------------------------
  // Training
  // -------------------------------------------------------------------------
  const tr = (
    id: string,
    orgId: string,
    userId: string,
    course: string,
    completedDaysAgo: number,
    expiresInDays: number | null,
  ): TrainingRecord => ({
    ...base(id, orgId, completedDaysAgo),
    userId,
    course,
    completedAt: day(-completedDaysAgo),
    expiresAt: expiresInDays === null ? null : day(expiresInDays),
  })
  const DPA = 'Data Privacy Act essentials'
  const SEC = 'Security awareness'
  const INC = 'Incident reporting'
  const trainingRecords: TrainingRecord[] = [
    tr('trn_01', 'org_3rdloop', 'usr_jehnsen', DPA, 200, 165),
    tr('trn_02', 'org_3rdloop', 'usr_jehnsen', SEC, 100, 265),
    tr('trn_03', 'org_3rdloop', 'usr_jehnsen', INC, 100, null),
    tr('trn_04', 'org_3rdloop', 'usr_michael', DPA, 380, -15),
    tr('trn_05', 'org_3rdloop', 'usr_michael', SEC, 20, 345),
    tr('trn_06', 'org_3rdloop', 'usr_staff', DPA, 340, 25),
    tr('trn_07', 'org_3rdloop', 'usr_staff', INC, 10, null),
    tr('trn_sc_01', 'org_sample_clinic', 'usr_clinic_dpo', DPA, 60, 305),
    tr('trn_sc_02', 'org_sample_clinic', 'usr_clinic_staff', DPA, 350, 15),
  ]

  // -------------------------------------------------------------------------
  // Activity
  // -------------------------------------------------------------------------
  const event = (
    id: string,
    actor: { id: string; name: string },
    action: string,
    target: { type: string; id: string; label: string },
    when: string,
    details: Record<string, unknown> = {},
  ): AuditEvent => ({
    id,
    orgId: 'org_3rdloop',
    actor,
    action,
    targetType: target.type,
    targetId: target.id,
    targetLabel: target.label,
    at: when,
    details,
  })
  const jehnsen = { id: 'usr_jehnsen', name: 'Jehnsen Enrique' }
  const michael = { id: 'usr_michael', name: 'Michael Manabat' }
  const staff = { id: 'usr_staff', name: 'Staff Member' }
  const inc2 = { type: 'incident', id: 'inc_2026_0002', label: `INC-${year}-0002` }
  const inc3 = { type: 'incident', id: 'inc_2026_0003', label: `INC-${year}-0003` }
  const audit: AuditEvent[] = [
    event('aud_inc2_1', jehnsen, 'incident.reported', inc2, at(closedDiscovered + HOUR)),
    event('aud_inc2_2', jehnsen, 'incident.triaged', inc2, at(closedDiscovered + 4 * HOUR), {
      notificationRequired: true,
    }),
    event(
      'aud_inc2_3',
      jehnsen,
      'incident.notices_drafted',
      inc2,
      at(closedDiscovered + 30 * HOUR),
    ),
    event(
      'aud_inc2_4',
      michael,
      'incident.notices_signed_off',
      inc2,
      at(closedDiscovered + 46 * HOUR),
    ),
    event('aud_inc2_5', jehnsen, 'incident.npc_notified', inc2, at(closedDiscovered + 50 * HOUR), {
      reference: 'NPC-BN-0815',
    }),
    event(
      'aud_inc2_6',
      jehnsen,
      'incident.subjects_notified',
      inc2,
      at(closedDiscovered + 60 * HOUR),
    ),
    event('aud_inc2_7', jehnsen, 'incident.closed', inc2, at(closedDiscovered + 20 * DAY)),
    event('aud_inc3_1', staff, 'incident.reported', inc3, ago(29 * HOUR)),
    event(
      'aud_reg_1',
      jehnsen,
      'registration.created',
      { type: 'registration', id: 'reg_3rdloop', label: 'NPC registration NPC-REG-2025-04127' },
      ago(300 * DAY),
    ),
    event('aud_inc3_2', jehnsen, 'incident.triaged', inc3, ago(20 * HOUR), { severity: 'high' }),
  ]

  return {
    files,
    processingActivities,
    pias,
    dsrs,
    incidents,
    agreements,
    registrations,
    trainingRecords,
    audit,
  }
}
