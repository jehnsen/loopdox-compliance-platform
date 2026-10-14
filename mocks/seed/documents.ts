import { formatInTimeZone } from 'date-fns-tz'
import type {
  Acknowledgement,
  AuditEvent,
  Classification,
  Document,
  DocumentStatus,
  ReviewCycleMonths,
  WorkflowEvent,
} from '@/lib/api/types'
import { addMonthsToDate } from '@/lib/utils/dates'
import { POLICY_CONTENT, renderPolicyBody, SECTION_BODIES } from '@/mocks/seed/policy-content'
import { POLICY_SECTIONS, POLICY_TITLES, type PolicySectionKey } from '@/mocks/seed/policies'
import type { MockDocumentVersion } from '@/mocks/store'

const DAY = 86_400_000
const HOUR = 3_600_000
const TZ = 'Asia/Manila'

type StoredWorkflow = Omit<WorkflowEvent, 'actorName'>

export interface DocumentSeed {
  documents: Document[]
  versions: MockDocumentVersion[]
  workflow: StoredWorkflow[]
  acknowledgements: Acknowledgement[]
  audit: AuditEvent[]
}

interface Plan {
  docId: string
  owner: string
  cycle: ReviewCycleMonths
  classification: Classification
  /** Number of versions. */
  versions: number
  approved: number | null
  status: DocumentStatus
  /** Days ago the approved version was approved. */
  approvedDaysAgo?: number
  /** Hours ago each post-approval (or never-approved) version was created, oldest first. */
  laterVersionsHoursAgo?: number[]
  /** Hours ago the latest version was submitted (status in_review). */
  submittedHoursAgo?: number
  /** Reject the given version, `hoursAgo` hours ago. */
  rejected?: { version: number; hoursAgo: number; note: string }
}

const J = 'usr_jehnsen'
const M = 'usr_michael'

const PLANS: Plan[] = [
  { docId: 'ITD-001', owner: J, cycle: 12, classification: 'internal', versions: 3, approved: 3, status: 'approved', approvedDaysAgo: 120 },
  { docId: 'ITD-002', owner: M, cycle: 24, classification: 'internal', versions: 2, approved: 2, status: 'approved', approvedDaysAgo: 200 },
  { docId: 'ITD-003', owner: J, cycle: 12, classification: 'internal', versions: 3, approved: 3, status: 'approved', approvedDaysAgo: 345 },
  { docId: 'ITD-004', owner: J, cycle: 12, classification: 'internal', versions: 4, approved: 4, status: 'approved', approvedDaysAgo: 60 },
  { docId: 'ITD-005', owner: J, cycle: 24, classification: 'internal', versions: 2, approved: 2, status: 'approved', approvedDaysAgo: 150 },
  { docId: 'ITD-006', owner: J, cycle: 12, classification: 'internal', versions: 4, approved: 4, status: 'approved', approvedDaysAgo: 45 },
  { docId: 'ITD-007', owner: J, cycle: 12, classification: 'internal', versions: 3, approved: 2, status: 'in_review', approvedDaysAgo: 210, laterVersionsHoursAgo: [6], submittedHoursAgo: 5 },
  { docId: 'ITD-008', owner: J, cycle: 12, classification: 'internal', versions: 3, approved: 3, status: 'approved', approvedDaysAgo: 2 },
  { docId: 'ITD-009', owner: J, cycle: 24, classification: 'internal', versions: 2, approved: 2, status: 'approved', approvedDaysAgo: 90 },
  {
    docId: 'ITD-010', owner: J, cycle: 12, classification: 'internal', versions: 2, approved: null, status: 'draft',
    laterVersionsHoursAgo: [240, 40],
    rejected: { version: 1, hoursAgo: 190, note: 'Please add a requirement for dependency vulnerability scanning before this goes out.' },
  },
  { docId: 'ITD-011', owner: J, cycle: 12, classification: 'internal', versions: 2, approved: 2, status: 'approved', approvedDaysAgo: 100 },
  { docId: 'ITD-012', owner: J, cycle: 12, classification: 'internal', versions: 3, approved: 3, status: 'approved', approvedDaysAgo: 30 },
  { docId: 'ITD-013', owner: J, cycle: 12, classification: 'internal', versions: 2, approved: 2, status: 'approved', approvedDaysAgo: 390 },
  { docId: 'ITD-014', owner: J, cycle: 12, classification: 'internal', versions: 2, approved: 2, status: 'approved', approvedDaysAgo: 170 },
  { docId: 'ITD-015', owner: J, cycle: 6, classification: 'internal', versions: 3, approved: 2, status: 'draft', approvedDaysAgo: 80, laterVersionsHoursAgo: [72] },
  { docId: 'ITD-016', owner: J, cycle: 12, classification: 'internal', versions: 2, approved: 2, status: 'approved', approvedDaysAgo: 75 },
]

/** Staff have not yet acknowledged these approved versions. */
const STAFF_PENDING = new Set(['ITD-008', 'ITD-012'])

const userNames: Record<string, string> = {
  usr_jehnsen: 'Jehnsen Enrique',
  usr_michael: 'Michael Manabat',
  usr_staff: 'Staff Member',
  usr_clinic_dpo: 'Dra. Liza Santos',
  usr_clinic_staff: 'Clinic Front Desk',
}

export function docIdToInternal(docId: string): string {
  return `doc_${docId.toLowerCase().replace(/-/g, '_')}`
}

function dateInTz(ms: number): string {
  return formatInTimeZone(new Date(ms), TZ, 'yyyy-MM-dd')
}

class Builder {
  out: DocumentSeed = { documents: [], versions: [], workflow: [], acknowledgements: [], audit: [] }
  private seq = 0
  constructor(private now: number) {}

  iso(ms: number) {
    return new Date(ms).toISOString()
  }

  id(prefix: string) {
    this.seq += 1
    return `${prefix}_seed_${this.seq}`
  }

  audit(orgId: string, actor: string, action: string, doc: { id: string; docId: string; title: string }, at: number, details: Record<string, unknown> = {}) {
    this.out.audit.push({
      id: this.id('aud'),
      orgId,
      actor: { id: actor, name: userNames[actor] ?? actor },
      action,
      targetType: 'document',
      targetId: doc.id,
      targetLabel: `${doc.docId} ${doc.title}`,
      at: this.iso(at),
      ip: '203.177.12.40',
      details,
    })
  }

  workflow(orgId: string, doc: Document, version: number, type: StoredWorkflow['type'], actor: string, at: number, note: string | null = null) {
    this.out.workflow.push({ id: this.id('wfe'), documentId: doc.id, version, type, actor, note, at: this.iso(at) })
    this.audit(orgId, actor, `document.${type === 'submit' ? 'submitted' : type === 'approve' ? 'approved' : type === 'reject' ? 'changes_requested' : 'retired'}`, doc, at, { version, ...(note ? { note } : {}) })
  }

  version(orgId: string, doc: Document, n: number, title: string, body: string, summary: string, author: string, at: number) {
    this.out.versions.push({
      id: `ver_${doc.id.slice(4)}_${n}`,
      orgId,
      documentId: doc.id,
      version: n,
      title,
      bodyMarkdown: body,
      changeSummary: summary,
      type: n === 1 ? 'create' : 'edit',
      restoredFrom: null,
      author,
      createdAt: this.iso(at),
    })
    this.audit(orgId, author, n === 1 ? 'document.created' : 'document.edited', doc, at, { version: n })
  }
}

function baseDoc(orgId: string, id: string, docId: string, title: string, parentId: string | null, order: number, owner: string, createdAt: string): Document {
  return {
    id,
    orgId,
    createdAt,
    updatedAt: createdAt,
    createdBy: owner,
    updatedBy: owner,
    version: 1,
    sample: true,
    docId,
    title,
    parentId,
    order,
    owner,
    requiresApproval: true,
    reviewCycleMonths: 12,
    status: 'draft',
    currentVersion: 1,
    approvedVersion: null,
    effectiveDate: null,
    nextReviewDate: null,
    approvedBy: null,
    approvedAt: null,
    classification: 'internal',
    controlIds: [],
  }
}

function approve(doc: Document, version: number, at: number, by: string): void {
  doc.approvedVersion = version
  doc.approvedBy = by
  doc.approvedAt = new Date(at).toISOString()
  doc.effectiveDate = dateInTz(at)
  doc.nextReviewDate = addMonthsToDate(doc.effectiveDate, doc.reviewCycleMonths)
}

function seed3rdLoop(b: Builder, now: number): void {
  const org = 'org_3rdloop'
  const sectionIds = new Map<PolicySectionKey, string>()

  // Section pages: SEC-001…SEC-005, published without approval.
  POLICY_SECTIONS.forEach((s, i) => {
    const at = now - (300 + i) * DAY
    const doc = baseDoc(org, `doc_sec_${s.key}`, `SEC-00${i + 1}`, s.title, null, i, J, b.iso(at))
    doc.requiresApproval = false
    doc.reviewCycleMonths = 24
    doc.status = 'approved'
    approve(doc, 1, at, J)
    b.out.documents.push(doc)
    b.version(org, doc, 1, s.title, SECTION_BODIES[s.key] ?? '', 'First issue.', J, at)
    sectionIds.set(s.key, doc.id)
  })

  const orderInSection = new Map<string, number>()
  for (const plan of PLANS) {
    const meta = POLICY_TITLES.find((t) => t.docId === plan.docId)
    const content = POLICY_CONTENT[plan.docId]
    if (!meta || !content) throw new Error(`Missing seed content for ${plan.docId}`)
    const parentId = sectionIds.get(meta.section) ?? null
    const order = orderInSection.get(meta.section) ?? 0
    orderInSection.set(meta.section, order + 1)

    // When each version was created, and (for approved history) approved.
    const created: number[] = []
    const approvedHistory = plan.approved ?? 0
    const approvedAt = plan.approvedDaysAgo !== undefined ? now - plan.approvedDaysAgo * DAY : null
    for (let v = 1; v <= approvedHistory; v++) {
      created.push((approvedAt ?? now) - (3 + (approvedHistory - v) * 95) * DAY)
    }
    for (const h of plan.laterVersionsHoursAgo ?? []) created.push(now - h * HOUR)

    const doc = baseDoc(org, docIdToInternal(plan.docId), plan.docId, meta.title, parentId, order, plan.owner, b.iso(created[0] ?? now))
    doc.reviewCycleMonths = plan.cycle
    doc.classification = plan.classification
    b.out.documents.push(doc)

    for (let v = 1; v <= plan.versions; v++) {
      const at = created[v - 1] ?? now
      const spec = content.versions[v - 1]
      const author = spec?.author ?? plan.owner
      b.version(org, doc, v, meta.title, renderPolicyBody(content, v, plan.cycle), spec?.summary ?? 'Update.', author, at)
      doc.updatedAt = b.iso(at)
      doc.updatedBy = author
      doc.currentVersion = v
      if (v <= approvedHistory) {
        // Every version up to the approved one went through review and approval.
        const approveAt = v === approvedHistory && approvedAt !== null ? approvedAt : at + 2 * DAY
        b.workflow(org, doc, v, 'submit', author, approveAt - 20 * HOUR)
        b.workflow(org, doc, v, 'approve', M, approveAt)
        approve(doc, v, approveAt, M)
        doc.version += 1
      }
      if (plan.rejected?.version === v) {
        b.workflow(org, doc, v, 'submit', author, now - (plan.rejected.hoursAgo + 20) * HOUR)
        b.workflow(org, doc, v, 'reject', M, now - plan.rejected.hoursAgo * HOUR, plan.rejected.note)
      }
      doc.version += 1
    }
    if (plan.status === 'in_review' && plan.submittedHoursAgo !== undefined) {
      b.workflow(org, doc, plan.versions, 'submit', plan.owner, now - plan.submittedHoursAgo * HOUR)
    }
    doc.status = plan.status

    // Acknowledgements of the approved version.
    if (doc.approvedVersion && doc.approvedAt) {
      const ackAt = Math.min(Date.parse(doc.approvedAt) + 20 * HOUR, now - HOUR)
      const users = [J, M, ...(STAFF_PENDING.has(plan.docId) ? [] : ['usr_staff'])]
      for (const userId of users) {
        b.out.acknowledgements.push({ id: b.id('ack'), documentId: doc.id, version: doc.approvedVersion, userId, at: b.iso(ackAt) })
      }
    }
  }
}

const CLINIC_PRIVACY_V1 = `## 1. Purpose

Sample Clinic protects the personal and health information of its patients and staff, as required by the Data Privacy Act of 2012.

## 2. Our commitments

- We collect only the information needed to provide care and run the clinic.
- Patient records are kept in locked cabinets or in the clinic system, which requires a password.
- We do not share patient information without consent, except where the law requires it.

## 3. Your rights

Patients may ask to see, correct or object to the use of their information. Ask at the front desk or email the Data Protection Officer.
`

const CLINIC_PRIVACY_V2 = CLINIC_PRIVACY_V1.replace(
  'Patient records are kept in locked cabinets or in the clinic system, which requires a password.',
  'Patient records are kept in locked cabinets or in the clinic system, which requires a personal login and multi-factor authentication.',
).replace(
  '## 3. Your rights',
  `## 3. Breaches

Staff report any lost record, misdirected message or suspicious access to the DPO the same day. See [[CLN-003]].

## 4. Your rights`,
)

const CLINIC_RECORDS = `## 1. Purpose

How front desk and clinical staff handle patient records day to day.

## 2. Procedure

1. Check the patient’s identity before opening their record.
2. Never leave a record open on an unattended screen.
3. Return paper charts to the locked cabinet by the end of each clinic day.
4. Send records to other providers only through the approved secure email, after confirming the recipient.
`

const CLINIC_BREACH = `## 1. Purpose

What to do when patient information may have been lost, disclosed or accessed without authority.

## 2. Steps

1. Report it to the DPO immediately, even if you are not sure.
2. The DPO assesses whether the breach must be reported to the National Privacy Commission.
3. If it must, the DPO notifies the NPC and affected patients within 72 hours of knowing about it.
4. Record what happened and what was done in LoopDox.
`

function seedClinic(b: Builder, now: number): void {
  const org = 'org_sample_clinic'
  const L = 'usr_clinic_dpo'
  const make = (docId: string, title: string, order: number, bodies: [string, string][], approvedVersion: number | null, approvedDaysAgo: number) => {
    const firstAt = now - (approvedDaysAgo + 100 * bodies.length) * DAY
    const doc = baseDoc(org, docIdToInternal(docId), docId, title, null, order, L, b.iso(firstAt))
    b.out.documents.push(doc)
    bodies.forEach(([body, summary], i) => {
      const v = i + 1
      const at = approvedVersion === null ? now - (5 - i) * DAY : now - (approvedDaysAgo + (bodies.length - v) * 100 + 2) * DAY
      b.version(org, doc, v, title, body, summary, L, at)
      doc.currentVersion = v
      doc.updatedAt = b.iso(at)
      doc.version += 1
      if (approvedVersion !== null && v <= approvedVersion) {
        const approveAt = v === approvedVersion ? now - approvedDaysAgo * DAY : at + DAY
        b.workflow(org, doc, v, 'submit', L, approveAt - 4 * HOUR)
        b.workflow(org, doc, v, 'approve', L, approveAt)
        approve(doc, v, approveAt, L)
      }
    })
    doc.status = approvedVersion === null ? 'draft' : 'approved'
    if (doc.approvedVersion && doc.approvedAt) {
      b.out.acknowledgements.push({ id: b.id('ack'), documentId: doc.id, version: doc.approvedVersion, userId: L, at: b.iso(Date.parse(doc.approvedAt) + HOUR) })
      if (docId === 'CLN-001') {
        b.out.acknowledgements.push({ id: b.id('ack'), documentId: doc.id, version: doc.approvedVersion, userId: 'usr_clinic_staff', at: b.iso(Date.parse(doc.approvedAt) + DAY) })
      }
    }
  }
  make('CLN-001', 'Data Privacy Policy', 0, [[CLINIC_PRIVACY_V1, 'First issue.'], [CLINIC_PRIVACY_V2, 'Require MFA; add breach reporting.']], 2, 355)
  make('CLN-002', 'Patient Records Handling Procedure', 1, [[CLINIC_RECORDS, 'First draft.']], null, 0)
  make('CLN-003', 'Personal Data Breach Response Procedure', 2, [[CLINIC_BREACH, 'First issue.']], 1, 100)
}

export function seedDocuments(now: Date): DocumentSeed {
  const b = new Builder(now.getTime())
  seed3rdLoop(b, now.getTime())
  seedClinic(b, now.getTime())
  return b.out
}
