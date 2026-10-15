/**
 * API contract types. The FastAPI backend implements these shapes exactly;
 * every endpoint is documented in docs/api-contract.md.
 *
 * Conventions: JSON, ISO 8601 UTC timestamps, string IDs.
 */

/** ISO 8601 UTC timestamp, e.g. "2026-10-14T02:30:00.000Z". */
export type ISODateTime = string
/** Calendar date in the tenant's timezone, e.g. "2026-10-14". */
export type ISODate = string

// ---------------------------------------------------------------------------
// Shared envelopes
// ---------------------------------------------------------------------------

export interface ListResponse<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

/** Query params every list endpoint accepts (plus per-field filters). */
export interface ListQuery {
  page?: number
  pageSize?: number
  /** Field name, prefix with "-" for descending: "-updatedAt". */
  sort?: string
  q?: string
  [filter: string]: string | number | boolean | string[] | undefined
}

export type ApiErrorCode =
  | 'validation_error'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'version_conflict'
  | 'unprocessable'
  | 'rate_limited'
  | 'feature_not_in_plan'
  | 'internal_error'
  | (string & {})

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
    /** Field path → message, for 400 validation errors. */
    fields?: Record<string, string>
  }
}

/** Fields every entity carries. */
export interface BaseEntity {
  id: string
  orgId: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  createdBy: string
  updatedBy: string
  /** Optimistic-concurrency counter. Updates send `ifVersion`; mismatch → 409. */
  version: number
  /** Seeded sample record (mock mode). */
  sample?: boolean
}

// ---------------------------------------------------------------------------
// Auth, tenants, members
// ---------------------------------------------------------------------------

export type Role = 'owner' | 'admin' | 'dpo' | 'cto' | 'approver' | 'staff' | 'auditor'

export type Tier = 'starter' | 'pro' | 'premium' | 'visorshield_only'

export type Permission =
  | 'policies.read'
  | 'policies.read_drafts'
  | 'policies.edit'
  | 'policies.approve'
  | 'policies.acknowledge'
  | 'privacy.read'
  | 'privacy.edit'
  | 'incidents.report'
  | 'incidents.sign_off'
  | 'security.read'
  | 'security.edit'
  | 'evidence.read'
  | 'evidence.edit'
  | 'ask.use'
  | 'questionnaires.read'
  | 'questionnaires.edit'
  | 'ai.read'
  | 'ai.edit'
  | 'org.manage'
  | 'members.manage'
  | 'plan.manage'
  | 'audit_log.read'
  | 'sensitive.reveal'

export interface User {
  id: string
  name: string
  email: string
  /** Job title shown in pickers, e.g. "Chief Technology Officer". */
  title: string | null
}

export interface OrgSummary {
  id: string
  slug: string
  name: string
  tier: Tier
}

export interface ClassificationLabels {
  public: string
  internal: string
  confidential: string
  restricted: string
}

export interface OrgSettings {
  /** Days allowed to respond to a data subject request. A tenant setting, not legal advice. */
  dsrResponseDays: number
  /** Days before a policy review date that reminders start. */
  reviewReminderLeadDays: number
  classificationLabels: ClassificationLabels
}

export interface Org extends OrgSummary {
  timezone: string
  currency: 'PHP'
  logoUrl: string | null
  settings: OrgSettings
  version: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface MembershipSummary {
  org: OrgSummary
  roles: Role[]
}

export interface Member {
  id: string
  orgId: string
  userId: string
  name: string
  email: string
  title: string | null
  roles: Role[]
  status: 'active' | 'invited'
  /** Auditor guests only: access ends at this time. */
  expiresAt: ISODateTime | null
  invitedAt: ISODateTime | null
  joinedAt: ISODateTime | null
  version: number
}

export interface UsageMeter {
  used: number
  /** null = unlimited on this tier. */
  limit: number | null
}

export interface Usage {
  /** Ask questions in the current calendar month (tenant timezone). */
  askQuestions: UsageMeter & { periodStart: ISODate }
  users: UsageMeter
  storageMb: UsageMeter
  connectors: UsageMeter
}

/** GET /me?org=:slug */
export interface MeResponse {
  user: User
  memberships: MembershipSummary[]
  /** Tenant named by ?org= (or the only membership). null when the user has several and none was named. */
  org: Org | null
  roles: Role[]
  tier: Tier | null
  permissions: Permission[]
  usage: Usage | null
  /** Which API the BFF is talking to. The UI shows the sample-data banner only in mock mode. */
  apiMode: 'mock' | 'live'
}

export interface LoginRequest {
  email: string
  password: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  /** Access token lifetime in seconds. */
  expiresIn: number
  /** Refresh token lifetime in seconds. */
  refreshExpiresIn: number
}

export interface InvitePreview {
  token: string
  orgName: string
  email: string
  roles: Role[]
  invitedBy: string
  expiresAt: ISODateTime
}

// ---------------------------------------------------------------------------
// Cross-cutting
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'approval_requested'
  | 'approval_decided'
  | 'deadline_dsr'
  | 'deadline_breach'
  | 'deadline_review'
  | 'deadline_rotation'
  | 'deadline_renewal'
  | 'mention'
  | 'connector_failed'

export interface Notification {
  id: string
  orgId: string
  userId: string
  type: NotificationType
  title: string
  body: string
  href: string
  at: ISODateTime
  readAt: ISODateTime | null
}

export interface NotificationList extends ListResponse<Notification> {
  unread: number
}

export interface AuditEvent {
  id: string
  orgId: string
  actor: { id: string; name: string } | null
  action: string
  targetType: string
  targetId: string
  /** Human label for the target, e.g. "ITD-006 Information Security Policy". */
  targetLabel: string | null
  at: ISODateTime
  ip?: string
  details: Record<string, unknown>
}

export type SearchResultType =
  | 'document'
  | 'processing_activity'
  | 'pia'
  | 'dsr'
  | 'incident'
  | 'agreement'
  | 'system'
  | 'secret_record'
  | 'change'
  | 'risk'
  | 'decision'
  | 'control'
  | 'evidence'
  | 'ai_use_case'

export interface SearchResult {
  type: SearchResultType
  id: string
  /** Display ID such as ITD-006 or DSR-2026-0012. */
  ref: string | null
  title: string
  href: string
  /** Plain-text excerpt; matched terms wrapped in «» for highlighting. */
  snippet: string | null
}

export interface SearchGroup {
  type: SearchResultType
  label: string
  /** Up to `limit` results, best match first. */
  items: SearchResult[]
  /** Every match in this group, so the UI can offer "Show all". */
  total: number
}

export interface SearchResponse {
  q: string
  groups: SearchGroup[]
}

// ---------------------------------------------------------------------------
// Overview dashboard (M4)
// ---------------------------------------------------------------------------

/** What needs attention, in the order the spec lists them (section 9.1). */
export type AttentionKind =
  | 'breach_deadline'
  | 'dsr_due'
  | 'policy_approval'
  | 'review_overdue'
  | 'secret_rotation'
  | 'access_review'
  | 'connector_failing'
  | 'agreement_renewal'

export interface AttentionItem {
  /** `${kind}:${recordId}` */
  id: string
  kind: AttentionKind
  /** bad = overdue (or a breach clock in the red); warn = coming up. */
  tone: 'bad' | 'warn'
  /** Display ID: INC-2026-0003, ITD-007. null for records without one. */
  ref: string | null
  title: string
  /** Why it needs attention, in plain words: "Due in 2 days". */
  detail: string
  /** Extra cue, e.g. "Ready for your decision". */
  badge: string | null
  /** Deadline for items with a live countdown (breaches). */
  deadline: ISODateTime | null
  /** App path of the record. */
  href: string
}

export interface DocumentCounts {
  /** Controlled documents the caller can see (section pages excluded). */
  total: number
  approved: number
  in_review: number
  draft: number
  retired: number
}

export interface ControlCoverage {
  framework: Framework
  passing: number
  failing: number
  no_evidence: number
  /** Controls that apply: not_applicable ones are left out. */
  total: number
}

export interface ActivityItem {
  id: string
  actor: { id: string; name: string } | null
  /** Audit action key, e.g. "document.approved". describeAction turns it into words. */
  action: string
  targetType: string
  targetLabel: string | null
  /** App path of the record, or null when it has no page. */
  href: string | null
  at: ISODateTime
  details: Record<string, unknown>
}

/** GET /orgs/:org/overview */
export interface OverviewResponse {
  generatedAt: ISODateTime
  /** null without `policies.read` or the Policies plan. */
  documents: DocumentCounts | null
  attention: {
    /** Before any "show more" cut: this is the number the dashboard reports. */
    total: number
    counts: Partial<Record<AttentionKind, number>>
    /** Ranked most urgent first. Empty for staff and auditor-only members. */
    items: AttentionItem[]
  }
  /** null on plans without Evidence, or without `evidence.read`. */
  controlCoverage: ControlCoverage[] | null
  /** null for staff and auditor-only members. */
  recentActivity: ActivityItem[] | null
}

// ---------------------------------------------------------------------------
// Policies (documents)
// ---------------------------------------------------------------------------

export type DocumentStatus = 'draft' | 'in_review' | 'approved' | 'retired'
export type ReviewCycleMonths = 6 | 12 | 24
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted'
/** Derived from nextReviewDate and the org's review reminder lead time. */
export type ReviewState = 'ok' | 'due_soon' | 'overdue'

export interface Document extends BaseEntity {
  /** Human ID, unique per org: "ITD-006". */
  docId: string
  title: string
  parentId: string | null
  /** Position among siblings, ascending. */
  order: number
  /** User ID. */
  owner: string
  requiresApproval: boolean
  reviewCycleMonths: ReviewCycleMonths
  status: DocumentStatus
  /** Latest content version number. */
  currentVersion: number
  /** Content version that is approved and in force; null if never approved. */
  approvedVersion: number | null
  effectiveDate: ISODate | null
  nextReviewDate: ISODate | null
  approvedBy: string | null
  approvedAt: ISODateTime | null
  classification: Classification
  controlIds: string[]
}

/** A document as returned by list/detail endpoints, with display names resolved. */
export interface DocumentSummary extends Document {
  ownerName: string
  approvedByName: string | null
  updatedByName: string
  /** null when not approved (no review date). */
  reviewState: ReviewState | null
  childCount: number
}

export type DocumentVersionType = 'create' | 'edit' | 'restore'

export interface DocumentVersionSummary {
  id: string
  documentId: string
  version: number
  title: string
  changeSummary: string
  type: DocumentVersionType
  /** For type "restore": the version whose content was copied. */
  restoredFrom: number | null
  author: string
  authorName: string
  createdAt: ISODateTime
}

export interface DocumentVersion extends DocumentVersionSummary {
  bodyMarkdown: string
}

export type WorkflowEventType = 'submit' | 'approve' | 'reject' | 'retire'

export interface WorkflowEvent {
  id: string
  documentId: string
  version: number
  type: WorkflowEventType
  actor: string
  actorName: string
  note: string | null
  at: ISODateTime
}

export interface DocumentDetail extends DocumentSummary {
  /**
   * The content this caller should read: the latest version for people who can
   * read drafts, the approved version for everyone else.
   */
  content: DocumentVersion | null
  children: DocumentSummary[]
  /** Newest first. */
  workflow: WorkflowEvent[]
  /** True when the caller has acknowledged the approved version. */
  acknowledgedByMe: boolean
  /** When the caller acknowledged the approved version, if they have. */
  acknowledgedAt: ISODateTime | null
}

/** Lightweight entry for wiki links, pickers and the tree. */
export interface DocumentLookupItem {
  id: string
  docId: string
  title: string
  status: DocumentStatus
  parentId: string | null
  order: number
  reviewState: ReviewState | null
}

export interface CreateDocumentRequest {
  docId: string
  title: string
  parentId: string | null
  owner: string
  reviewCycleMonths: ReviewCycleMonths
  requiresApproval: boolean
  classification: Classification
  bodyMarkdown: string
  changeSummary: string
}

/** Content edits (title/body) create a new version and need a changeSummary. */
export interface UpdateDocumentRequest extends Partial<
  Omit<CreateDocumentRequest, 'changeSummary'>
> {
  ifVersion: number
  changeSummary?: string
}

export interface Acknowledgement {
  id: string
  documentId: string
  version: number
  userId: string
  at: ISODateTime
}

export interface AcknowledgementStatus {
  documentId: string
  /** Approved version being acknowledged; null if the document isn't approved. */
  version: number | null
  required: number
  acknowledged: number
  members: {
    userId: string
    name: string
    title: string | null
    roles: Role[]
    acknowledgedAt: ISODateTime | null
  }[]
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export type Framework = 'ISO27001:2022' | 'DPA' | 'NPC' | 'internal'
export type ControlStatus = 'passing' | 'failing' | 'no_evidence' | 'not_applicable'

export interface Control extends BaseEntity {
  framework: Framework
  /** "A.5.15", "Sec. 20", "Circular 16-03". */
  reference: string
  title: string
  description: string
  documentIds: string[]
  owner: string
  evidenceFrequency: 'continuous' | 'monthly' | 'quarterly' | 'annually'
  status: ControlStatus
}

/** A control with what the Evidence pages need beside it (M6). */
export interface ControlSummary extends Control {
  ownerName: string
  evidenceCount: number
  /** When the newest evidence was collected. null when there is none. */
  lastEvidenceAt: ISODateTime | null
  /** Connectors whose checks feed this control, so the page can offer "Run … now". */
  connectors: { id: string; provider: ConnectorProvider; name: string; status: ConnectorStatus }[]
}

// ---------------------------------------------------------------------------
// Shared record plumbing (M3): files, links, masked values
// ---------------------------------------------------------------------------

/** 1–5 rating used for likelihood and impact. */
export type Score = 1 | 2 | 3 | 4 | 5

export type Severity = 'low' | 'medium' | 'high' | 'critical'

/** Days-to-deadline state shared by DSRs, agreements and registrations. */
export type DueState = 'ok' | 'due_soon' | 'overdue'

/** Metadata for an uploaded file. Contents are fetched from GET /files/:id. */
export interface FileRef {
  id: string
  name: string
  /** Bytes. */
  size: number
  contentType: string
  uploadedAt: ISODateTime
  uploadedBy: string
}

/** Records that can be linked to each other and shown in LinkedRecords. */
export type RecordType =
  | 'document'
  | 'processing_activity'
  | 'pia'
  | 'dsr'
  | 'incident'
  | 'agreement'
  | 'system'
  | 'risk'
  | 'access_grant'
  | 'secret_record'
  | 'change'
  | 'decision'
  | 'control'

/** A pointer to any record: enough to render an ID chip, a title and a link. */
export interface RecordRef {
  type: RecordType
  id: string
  /** Display ID: PA-002, DSR-2026-0012. */
  ref: string | null
  title: string
  /** App path: "/3rdloop/privacy/processing/pa_002". */
  href: string
  status: string | null
}

export interface LinkedRecord extends RecordRef {
  /** "to": this record holds the link. "from": the other record links to this one. */
  direction: 'to' | 'from'
}

export interface LinkGroup {
  type: RecordType
  /** Plural label: "Processing records". */
  label: string
  items: LinkedRecord[]
  /** The caller may add or remove links in this group. */
  linkable: boolean
}

/** GET /links?type&id: every relation the record can have on this plan, including empty ones. */
export interface LinksResponse {
  groups: LinkGroup[]
}

export interface LinkRequest {
  from: { type: RecordType; id: string }
  to: { type: RecordType; id: string }
}

/** Fields served masked (`•••• 4821`) and revealed one at a time through /sensitive/reveal. */
export type SensitiveField = 'requesterName' | 'requesterContact'

export interface RevealRequest {
  targetType: 'dsr'
  targetId: string
  field: SensitiveField
}

export interface RevealResponse {
  value: string
}

// ---------------------------------------------------------------------------
// Privacy: processing records (M3)
// ---------------------------------------------------------------------------

export type LegalBasis =
  | 'consent'
  | 'contract'
  | 'legal_obligation'
  | 'vital_interests'
  | 'public_authority'
  | 'legitimate_interests'

export type ProcessingStatus = 'draft' | 'approved' | 'retired'

export interface DataCategory {
  name: string
  /** Sensitive personal information (health, government IDs, and similar). */
  sensitive: boolean
}

/**
 * internal: a team inside the organisation. third_party: an outside organisation that
 * receives the data under contract, so it needs an agreement. authority: a government
 * body receiving statutory filings (no agreement expected).
 */
export type RecipientKind = 'internal' | 'third_party' | 'authority'

export interface Recipient {
  name: string
  kind: RecipientKind
}

export type ProcessingWarning = 'no_pia' | 'no_agreement' | 'no_retention'

export interface ProcessingActivity extends BaseEntity {
  /** "PA-002" */
  ref: string
  name: string
  purpose: string
  legalBasis: LegalBasis
  dataSubjects: string[]
  dataCategories: DataCategory[]
  /** Where the data comes from. */
  sources: string
  recipients: Recipient[]
  crossBorder: { transfers: boolean; countries: string[] }
  /** Free text, e.g. "5 years after the engagement ends". null = not set. */
  retention: string | null
  systemIds: string[]
  agreementIds: string[]
  owner: string
  status: ProcessingStatus
}

export interface ProcessingActivitySummary extends ProcessingActivity {
  ownerName: string
  updatedByName: string
  /** The PIA covering this activity (signed off first, then the latest), or null. */
  piaId: string | null
  piaRef: string | null
  piaStatus: PiaStatus | null
  hasSensitive: boolean
  warnings: ProcessingWarning[]
  /** Third-party recipients with no linked agreement whose counterparty matches their name. */
  recipientsWithoutAgreement: string[]
}

export interface ProcessingActivityInput {
  name: string
  purpose: string
  legalBasis: LegalBasis
  dataSubjects: string[]
  dataCategories: DataCategory[]
  sources: string
  recipients: Recipient[]
  crossBorder: { transfers: boolean; countries: string[] }
  retention: string | null
  owner: string
  status: ProcessingStatus
}

// ---------------------------------------------------------------------------
// Privacy: impact assessments (M3)
// ---------------------------------------------------------------------------

export type PiaDecision = 'proceed' | 'proceed_with_conditions' | 'do_not_proceed'
export type PiaStatus = 'in_progress' | 'signed_off'
export type DataFlowStage = 'collection' | 'use' | 'storage' | 'sharing' | 'disposal'
/** Wizard steps: 1 Scope · 2 Data flows · 3 Risks · 4 Mitigations · 5 Decision. */
export type PiaStep = 1 | 2 | 3 | 4 | 5

export interface PiaRisk {
  id: string
  description: string
  likelihood: Score
  impact: Score
  mitigation: string
}

export interface Pia extends BaseEntity {
  /** "PIA-002" */
  ref: string
  processingActivityId: string
  scope: string
  dataFlows: Record<DataFlowStage, string>
  risks: PiaRisk[]
  /** Highest likelihood × impact among the risks; null with no risks. */
  overallScore: number | null
  decision: PiaDecision | null
  /** Required when the decision is "proceed with conditions". */
  conditions: string | null
  signedOffBy: string | null
  signedOffAt: ISODateTime | null
  status: PiaStatus
  /** Furthest step saved, so the wizard resumes there. */
  currentStep: PiaStep
}

export interface PiaSummary extends Pia {
  processingActivityRef: string | null
  processingActivityName: string | null
  signedOffByName: string | null
  updatedByName: string
}

export interface CreatePiaRequest {
  processingActivityId: string
  scope: string
}

export interface UpdatePiaRequest {
  ifVersion: number
  processingActivityId?: string
  scope?: string
  dataFlows?: Record<DataFlowStage, string>
  risks?: PiaRisk[]
  currentStep?: PiaStep
}

export interface SignOffPiaRequest {
  ifVersion: number
  decision: PiaDecision
  conditions?: string | null
}

// ---------------------------------------------------------------------------
// Privacy: data subject requests (M3)
// ---------------------------------------------------------------------------

export type DsrType = 'access' | 'correction' | 'erasure' | 'objection' | 'portability' | 'other'
export type DsrStatus = 'received' | 'identity_verified' | 'in_progress' | 'responded' | 'closed'
export type DsrChannel = 'email' | 'web_form' | 'phone' | 'letter' | 'in_person' | 'other'
export type DsrOutcome = 'granted' | 'partially_granted' | 'denied' | 'withdrawn'

export interface DsrEvent {
  id: string
  status: DsrStatus
  at: ISODateTime
  by: string
  byName: string
  note: string | null
}

export interface Dsr extends BaseEntity {
  /** "DSR-2026-0012" */
  ref: string
  type: DsrType
  /** Always masked in responses. Reveal through /sensitive/reveal. */
  requesterName: string
  /** Always masked in responses. */
  requesterContact: string
  channel: DsrChannel
  /** What the requester asked for. Shouldn't repeat their identifiers. */
  description: string
  /** Calendar date (tenant timezone). */
  receivedAt: ISODate
  /** receivedAt + the org's DSR response period. Calendar date. */
  dueAt: ISODate
  identityVerified: boolean
  assignee: string | null
  status: DsrStatus
  outcome: DsrOutcome | null
  responseNotes: string
  processingActivityIds: string[]
  files: FileRef[]
}

export interface DsrSummary extends Dsr {
  assigneeName: string | null
  /** null once responded or closed. */
  dueState: DueState | null
  /** Calendar days until dueAt; negative when overdue. */
  daysLeft: number
}

export interface DsrDetail extends DsrSummary {
  /** Oldest first. */
  events: DsrEvent[]
}

export interface CreateDsrRequest {
  type: DsrType
  requesterName: string
  requesterContact: string
  channel: DsrChannel
  description: string
  receivedAt: ISODate
  assignee: string | null
  processingActivityIds: string[]
}

export interface UpdateDsrRequest {
  ifVersion: number
  type?: DsrType
  channel?: DsrChannel
  description?: string
  assignee?: string | null
  responseNotes?: string
}

export interface DsrTransitionRequest {
  ifVersion: number
  status: DsrStatus
  note?: string
  /** Required when moving to "responded". */
  outcome?: DsrOutcome
}

// ---------------------------------------------------------------------------
// Privacy: incidents and breaches (M3)
// ---------------------------------------------------------------------------

export type IncidentStatus = 'reported' | 'triage' | 'contained' | 'notified' | 'closed'

export interface NoticeDraft {
  subject: string
  body: string
}

export interface IncidentNotices {
  /** Notice to the National Privacy Commission. */
  npc: NoticeDraft
  /** Notice to affected data subjects. */
  subjects: NoticeDraft
  draftedAt: ISODateTime
  draftedBy: string
  draftedByName: string
  signedOffBy: string | null
  signedOffByName: string | null
  signedOffAt: ISODateTime | null
}

export interface Incident extends BaseEntity {
  /** "INC-2026-0003" */
  ref: string
  title: string
  description: string
  /** When the organisation learned of it. The 72-hour clock runs from here. */
  discoveredAt: ISODateTime
  reportedBy: string
  /** "What's affected", in the reporter's words. */
  affectedSummary: string
  /** null until triage. */
  severity: Severity | null
  personalDataInvolved: boolean
  affectedCount: number | null
  processingActivityIds: string[]
  systemIds: string[]
  /** Policies changed because of this incident. */
  documentIds: string[]
  /** Risks raised from the post-incident review. */
  riskIds: string[]
  /** null = not decided yet. */
  notificationRequired: boolean | null
  notificationRationale: string | null
  /** discoveredAt + 72 hours when personal data is involved; null otherwise. */
  notificationDeadline: ISODateTime | null
  npcNotifiedAt: ISODateTime | null
  /** Reference the NPC gave when the notification was received. */
  npcReference: string | null
  subjectsNotifiedAt: ISODateTime | null
  containedAt: ISODateTime | null
  closedAt: ISODateTime | null
  status: IncidentStatus
  postIncidentReview: string | null
  notices: IncidentNotices | null
}

export interface IncidentSummary extends Incident {
  reportedByName: string
  updatedByName: string
}

/** POST /incidents returns a receipt: reporters without privacy.read can't open the record. */
export interface IncidentReceipt {
  id: string
  ref: string
  title: string
  notificationDeadline: ISODateTime | null
  createdAt: ISODateTime
}

export interface ReportIncidentRequest {
  title: string
  description: string
  discoveredAt: ISODateTime
  affectedSummary: string
  personalDataInvolved: boolean
}

export interface UpdateIncidentRequest {
  ifVersion: number
  title?: string
  description?: string
  discoveredAt?: ISODateTime
  affectedSummary?: string
  severity?: Severity | null
  personalDataInvolved?: boolean
  affectedCount?: number | null
  notificationRequired?: boolean | null
  notificationRationale?: string | null
  status?: Exclude<IncidentStatus, 'notified'>
  postIncidentReview?: string | null
}

export interface UpdateNoticesRequest {
  ifVersion: number
  npc?: NoticeDraft
  subjects?: NoticeDraft
}

export interface RecordNotificationRequest {
  ifVersion: number
  kind: 'npc' | 'subjects'
  at: ISODateTime
  reference?: string | null
}

// ---------------------------------------------------------------------------
// Privacy: agreements, registration, training (M3)
// ---------------------------------------------------------------------------

export type AgreementType = 'dpa' | 'data_sharing' | 'nda' | 'msa'
export type AgreementRole = 'we_are_processor' | 'we_are_controller'

export interface Agreement extends BaseEntity {
  /** "AGR-003" */
  ref: string
  counterparty: string
  type: AgreementType
  role: AgreementRole
  signedAt: ISODate
  /** null = no fixed term. */
  renewsAt: ISODate | null
  fileId: string | null
  owner: string
  notes: string
}

export interface AgreementSummary extends Agreement {
  ownerName: string
  updatedByName: string
  file: FileRef | null
  /** Processing records that list this agreement. */
  processingActivityIds: string[]
  /** due_soon = renews within 30 days; overdue = renewal date passed. null with no renewal date. */
  renewalState: DueState | null
  daysToRenewal: number | null
}

export interface AgreementInput {
  counterparty: string
  type: AgreementType
  role: AgreementRole
  signedAt: ISODate
  renewsAt: ISODate | null
  fileId: string | null
  owner: string
  notes: string
  processingActivityIds: string[]
}

export type RegistrationStatus = 'registered' | 'renewal_due' | 'expired'

export interface Registration extends BaseEntity {
  registrar: 'NPC'
  reference: string
  dpoName: string
  dpoEmail: string
  registeredAt: ISODate
  renewsAt: ISODate
  notes: string
}

export interface RegistrationSummary extends Registration {
  /** renewal_due = renews within 30 days. */
  status: RegistrationStatus
  daysToRenewal: number
}

export interface RegistrationInput {
  reference: string
  dpoName: string
  dpoEmail: string
  registeredAt: ISODate
  renewsAt: ISODate
  notes: string
}

export type TrainingState = 'valid' | 'expiring' | 'expired'

export interface TrainingRecord extends BaseEntity {
  userId: string
  course: string
  completedAt: ISODate
  /** null = doesn't expire. */
  expiresAt: ISODate | null
}

export interface TrainingRecordSummary extends TrainingRecord {
  userName: string
  /** expiring = expires within 30 days. */
  state: TrainingState
}

export interface TrainingRecordInput {
  userId: string
  course: string
  completedAt: ISODate
  expiresAt: ISODate | null
}

// ---------------------------------------------------------------------------
// Security records referenced by privacy (full module in M5)
// ---------------------------------------------------------------------------

export type SystemType =
  'server' | 'cloud_account' | 'repository' | 'domain' | 'saas' | 'database' | 'other'

export interface System extends BaseEntity {
  /** "SYS-001" */
  ref: string
  name: string
  type: SystemType
  provider: string
  owner: string
  classification: Classification
  hosting: string
  holdsPersonalData: boolean
  notes: string
}

export interface SystemSummary extends System {
  ownerName: string
  updatedByName: string
  /** Active access grants on this system. */
  grantCount: number
  secretCount: number
}

export interface SystemInput {
  name: string
  type: SystemType
  provider: string
  owner: string
  classification: Classification
  hosting: string
  holdsPersonalData: boolean
  notes: string
}

export type RiskTreatment = 'mitigate' | 'accept' | 'transfer' | 'avoid'
export type RiskStatus = 'open' | 'closed'

export interface Risk extends BaseEntity {
  /** "RISK-013" */
  ref: string
  title: string
  description: string
  likelihood: Score
  impact: Score
  /** likelihood × impact. */
  inherentScore: number
  treatment: RiskTreatment
  /** Likelihood and impact once the treatment is in place; null until assessed. */
  residualLikelihood: Score | null
  residualImpact: Score | null
  /** residualLikelihood × residualImpact; null until assessed. */
  residualScore: number | null
  owner: string
  documentIds: string[]
  controlIds: string[]
  reviewAt: ISODate
  status: RiskStatus
}

export interface RiskSummary extends Risk {
  ownerName: string
  updatedByName: string
  /** Review date state: overdue once passed, due_soon within 30 days. Null when closed. */
  reviewState: DueState | null
  daysToReview: number | null
}

export interface RiskInput {
  title: string
  description: string
  likelihood: Score
  impact: Score
  treatment: RiskTreatment
  residualLikelihood: Score | null
  residualImpact: Score | null
  owner: string
  reviewAt: ISODate
  status: RiskStatus
  documentIds: string[]
  controlIds: string[]
}

/** M3 creates risks from a post-incident review; the full register is M5. */
export interface CreateRiskRequest {
  title: string
  description: string
  likelihood: Score
  impact: Score
  owner: string
  /** Links the new risk to this incident. */
  incidentId?: string
}

// ---------------------------------------------------------------------------
// Security: access grants and reviews (M5)
// ---------------------------------------------------------------------------

export type AccessLevel = 'owner' | 'admin' | 'write' | 'read'
export type GrantStatus = 'active' | 'revoked'

export interface AccessGrant extends BaseEntity {
  systemId: string
  /** A member of the organisation… */
  userId: string | null
  /** …or someone outside it (a contractor, a vendor account). Exactly one is set. */
  externalName: string | null
  level: AccessLevel
  approvedBy: string
  grantedAt: ISODate
  lastReviewedAt: ISODate | null
  status: GrantStatus
  revokedAt: ISODateTime | null
  notes: string
}

export interface AccessGrantSummary extends AccessGrant {
  systemName: string
  systemRef: string
  /** Member name, or the external party's name. */
  personName: string
  /** Stable key for grouping by person: the user ID, or "ext:" plus the name. */
  personKey: string
  approvedByName: string
  updatedByName: string
}

export interface AccessGrantInput {
  systemId: string
  userId: string | null
  externalName: string | null
  level: AccessLevel
  approvedBy: string
  grantedAt: ISODate
  notes: string
}

export type ReviewDecision = 'keep' | 'revoke' | 'change'
export type AccessReviewStatus = 'in_progress' | 'signed_off'

export interface AccessReviewItem {
  grantId: string
  /** What the grant was when the review started, so the record stays readable after changes. */
  systemId: string
  systemName: string
  personName: string
  level: AccessLevel
  decision: ReviewDecision | null
  note: string
  /** For "change": the level the person should have. */
  newLevel: AccessLevel | null
  decidedBy: string | null
  decidedAt: ISODateTime | null
}

export interface AccessReview extends BaseEntity {
  /** "AR-001" */
  ref: string
  /** "2026-Q4" */
  period: string
  /** Last day of the period. */
  dueAt: ISODate
  systemIds: string[]
  reviewer: string
  items: AccessReviewItem[]
  status: AccessReviewStatus
  signedOffAt: ISODateTime | null
  signedOffBy: string | null
  /** The evidence item created at sign-off. */
  evidenceId: string | null
}

export interface AccessReviewSummary extends AccessReview {
  reviewerName: string
  signedOffByName: string | null
  updatedByName: string
  systemNames: string[]
  decided: number
  total: number
  counts: Record<ReviewDecision, number>
  /** overdue once the period has ended without sign-off. */
  dueState: DueState | null
  daysLeft: number
  /** Control that received the evidence, once signed off. */
  evidence: EvidenceItem | null
}

export interface CreateAccessReviewRequest {
  period: string
  systemIds: string[]
  reviewer: string
}

export interface ReviewDecisionRequest {
  ifVersion: number
  /** null clears the decision. */
  decision: ReviewDecision | null
  note?: string
  newLevel?: AccessLevel | null
}

export interface BulkKeepRequest {
  ifVersion: number
  /** Undecided items only; omit for all of them. */
  grantIds?: string[]
}

// ---------------------------------------------------------------------------
// Security: secrets, changes, decisions (M5)
// ---------------------------------------------------------------------------

/** Where a secret lives and when it is due for rotation. Never the secret value. */
export interface SecretRecord extends BaseEntity {
  /** "SCR-001" */
  ref: string
  name: string
  /** e.g. "Azure Key Vault: kv-prod". */
  location: string
  systemId: string | null
  owner: string
  lastRotatedAt: ISODate
  rotationDays: number
  /** lastRotatedAt + rotationDays. */
  nextDueAt: ISODate
  notes: string
}

export interface SecretRecordSummary extends SecretRecord {
  systemName: string | null
  ownerName: string
  updatedByName: string
  /** due_soon = within 14 days. */
  dueState: DueState
  /** Days until nextDueAt; negative when overdue. */
  daysLeft: number
}

export interface SecretRecordInput {
  name: string
  location: string
  systemId: string | null
  owner: string
  lastRotatedAt: ISODate
  rotationDays: number
  notes: string
}

export type ChangeSource = 'github_pr' | 'deploy' | 'manual'
/** Emergency changes need a review note within 2 days of deployment. */
export type ChangeReviewState = 'not_required' | 'pending' | 'overdue' | 'done'

export interface Change extends BaseEntity {
  /** "CHG-001" */
  ref: string
  source: ChangeSource
  externalUrl: string | null
  systemId: string
  summary: string
  /** null for an emergency change approved after the fact. */
  approver: string | null
  deployedAt: ISODateTime
  rollbackPlan: string
  emergency: boolean
  reviewNote: string | null
  reviewedAt: ISODateTime | null
  reviewedBy: string | null
}

export interface ChangeSummary extends Change {
  systemName: string
  approverName: string | null
  updatedByName: string
  reviewedByName: string | null
  reviewState: ChangeReviewState
  /** deployedAt + 48 hours, for emergency changes. */
  reviewDueAt: ISODateTime | null
}

export interface ChangeInput {
  source: ChangeSource
  externalUrl: string | null
  systemId: string
  summary: string
  approver: string | null
  deployedAt: ISODateTime
  rollbackPlan: string
  emergency: boolean
}

export type DecisionStatus = 'proposed' | 'accepted' | 'superseded'

/** An architecture decision record (ADR). */
export interface Decision extends BaseEntity {
  /** "ADR-003" */
  ref: string
  title: string
  context: string
  decision: string
  consequences: string
  status: DecisionStatus
  decidedBy: string
  decidedAt: ISODate
  systemIds: string[]
  /** The decision that replaced this one. */
  supersededBy: string | null
  /** The decision this one replaces. */
  supersedes: string | null
}

export interface DecisionSummary extends Decision {
  decidedByName: string
  updatedByName: string
  supersededByRef: string | null
  supersedesRef: string | null
}

export interface DecisionInput {
  title: string
  context: string
  decision: string
  consequences: string
  status: Exclude<DecisionStatus, 'superseded'>
  decidedBy: string
  decidedAt: ISODate
  systemIds: string[]
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type EvidenceSource = 'connector' | 'upload' | 'manual'
export type EvidenceResult = 'pass' | 'fail' | 'info'

export interface Evidence extends BaseEntity {
  controlId: string
  source: EvidenceSource
  connectorId: string | null
  /** The connector check that produced this item (connector evidence only). */
  checkId?: string | null
  collectedAt: ISODateTime
  result: EvidenceResult
  summary: string
  fileId: string | null
  /** The record this evidence was generated from, if any. */
  origin: { type: 'access_review'; id: string; label: string } | null
}

export interface EvidenceItem extends Evidence {
  controlReference: string
  controlTitle: string
  collectedByName: string | null
  file: FileRef | null
  /** "GitHub", for connector evidence. */
  connectorName: string | null
  /** App path of the origin record. */
  originHref: string | null
}

// ---------------------------------------------------------------------------
// Connectors (M6)
// ---------------------------------------------------------------------------

export type ConnectorProvider = 'github' | 'azure' | 'google_workspace' | 'hostinger'
export type ConnectorStatus = 'connected' | 'error' | 'disconnected'

export interface ConnectorCheck {
  /** Stable key from the provider catalogue, e.g. "github.branch_protection". */
  id: string
  name: string
  controlId: string
  controlReference: string
  /** null until the check has run. */
  lastResult: 'pass' | 'fail' | null
  detail: string | null
  checkedAt: ISODateTime | null
}

export interface ConnectorError {
  message: string
  /** What to do about it, in plain words. */
  fixHint: string
  at: ISODateTime
}

export interface Connector extends BaseEntity {
  provider: ConnectorProvider
  status: ConnectorStatus
  /** The account, organisation or tenant it is connected to. Never a credential. */
  account: string | null
  connectedAt: ISODateTime | null
  lastRunAt: ISODateTime | null
  lastError: ConnectorError | null
  checks: ConnectorCheck[]
}

/** PATCH /connectors/:id */
export interface ConnectorUpdate {
  ifVersion: number
  status: 'connected' | 'disconnected'
  /** Required when connecting or reconfiguring. */
  account?: string
}

/** POST /connectors/:id/run */
export interface ConnectorRunResult {
  connector: Connector
  /** false when the run couldn't reach the provider; the connector's lastError says why. */
  ok: boolean
  evidence: EvidenceItem[]
}

/** POST /evidence (multipart fields, besides the file). */
export interface EvidenceUploadFields {
  controlId: string
  summary: string
  result: EvidenceResult
  /** "2026-10-14". Defaults to today; the future is refused. */
  collectedOn?: ISODate
}

// ---------------------------------------------------------------------------
// Audit pack (M6)
// ---------------------------------------------------------------------------

export interface AuditPackPolicy {
  id: string
  docId: string
  title: string
  /** The approved version on record. */
  version: number
  approvedAt: ISODateTime | null
  approvedByName: string | null
  effectiveDate: ISODate | null
  href: string
}

export interface AuditPackControl {
  control: Control
  /** Status judged from the evidence inside the period. */
  periodStatus: ControlStatus
  policies: AuditPackPolicy[]
  evidence: EvidenceItem[]
}

export interface AuditPack {
  /** null = no bound on that side. */
  from: ISODate | null
  to: ISODate | null
  generatedAt: ISODateTime
  totals: {
    controls: number
    passing: number
    failing: number
    no_evidence: number
    evidence: number
  }
  controls: AuditPackControl[]
}

// ---------------------------------------------------------------------------
// Ask (M7)
// ---------------------------------------------------------------------------

/** policy: approved policy text · records: the registers · impact: what a change touches. */
export type AskRoute = 'policy' | 'records' | 'impact'

export type CitationKind = 'policy_section' | 'record' | 'evidence'

export interface Citation {
  /** 1-based number shown as the superscript [n] in the answer. */
  n: number
  kind: CitationKind
  /** "ITD-007 Access Control Policy › 3.2 Authentication" or "PA-002 Payroll". */
  label: string
  /** App path. Policy sections end in #heading-id. */
  href: string
  docId?: string
  /** Policy version quoted. */
  version?: number
  /** Heading anchor in the policy. */
  sectionId?: string
  /** The passage the answer relied on. Plain text. */
  excerpt: string | null
}

export interface AskFeedback {
  rating: 'up' | 'down'
  note: string | null
  at: ISODateTime
}

export interface AskMessage {
  id: string
  threadId: string
  role: 'user' | 'assistant'
  /** Assistant answers carry [n] markers that refer to `citations`. */
  content: string
  citations: Citation[]
  route: AskRoute | null
  /** History mode date the answer was given for. */
  asOf: ISODate | null
  /** False when nothing in the sources supported an answer ("couldn't find"). */
  grounded: boolean
  /** Follow-up questions offered with an ungrounded answer. */
  suggestions: string[]
  feedback: AskFeedback | null
  createdAt: ISODateTime
}

export interface AskThread {
  id: string
  orgId: string
  userId: string
  title: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  messageCount: number
}

export interface AskThreadDetail extends AskThread {
  messages: AskMessage[]
}

/** The page a Quick Ask was opened from. Answers favour that record. */
export interface AskContext {
  type: RecordType
  id: string
}

export interface AskRequest {
  question: string
  /** Continue a thread; omit to start one. */
  threadId?: string | null
  /** Pinned route; omit for automatic routing. */
  route?: AskRoute | null
  /** History mode: answer from the policy versions in force on this date. */
  asOf?: ISODate | null
  context?: AskContext | null
}

/** Server-Sent Events from POST /orgs/:org/ask, in order. */
export type AskStreamEvent =
  | { event: 'route'; data: { route: AskRoute } }
  | { event: 'citation'; data: Citation }
  | { event: 'token'; data: { text: string } }
  | {
      event: 'done'
      data: {
        messageId: string
        threadId: string
        userMessageId: string
        grounded: boolean
        suggestions: string[]
        usage: Usage['askQuestions']
      }
    }
  | { event: 'error'; data: { code: ApiErrorCode; message: string } }

export interface AskFeedbackRequest {
  rating: 'up' | 'down'
  note?: string
}

// ---------------------------------------------------------------------------
// Questionnaires (M7)
// ---------------------------------------------------------------------------

export type QuestionnaireFormat = 'csv' | 'xlsx'
export type QuestionnaireRowStatus = 'draft' | 'edited' | 'approved' | 'needs_input'
/** mapping: waiting for the column mapping · in_review: answers being reviewed · complete: every row approved. */
export type QuestionnaireStatus = 'mapping' | 'in_review' | 'complete'

export interface QuestionnaireRow {
  id: string
  /** Concurrency counter for this row; row updates send `ifVersion`. */
  version: number
  /** Row number in the original file (1-based, after the header). */
  index: number
  question: string
  /** Markdown-lite. Empty when nothing in the policies answered it. */
  draftAnswer: string
  citations: Citation[]
  status: QuestionnaireRowStatus
  /** Last person to edit or approve the row. */
  editor: string | null
  editorName: string | null
  updatedAt: ISODateTime
}

export interface QuestionnaireMapping {
  /** Column index (0-based) holding the questions. */
  questionColumn: number
  /** Column index for answers; null appends a new "Answer" column on export. */
  answerColumn: number | null
}

export interface QuestionnaireProgress {
  total: number
  approved: number
  edited: number
  draft: number
  needsInput: number
}

export interface QuestionnaireSummary extends BaseEntity {
  name: string
  client: string
  fileName: string
  format: QuestionnaireFormat
  uploadedAt: ISODateTime
  uploadedBy: string
  uploadedByName: string
  status: QuestionnaireStatus
  progress: QuestionnaireProgress
}

export interface Questionnaire extends QuestionnaireSummary {
  /** Header row of the file. */
  columns: string[]
  /** First rows under the header, for the mapping step. */
  preview: string[][]
  /** Mapping suggested from the column names (mapping step). */
  suggestedMapping: QuestionnaireMapping | null
  mapping: QuestionnaireMapping | null
  /** Empty until mapped. */
  rows: QuestionnaireRow[]
}

export interface QuestionnaireRowUpdate {
  ifVersion: number
  draftAnswer?: string
  status?: QuestionnaireRowStatus
}

/** PATCH /questionnaires/:id/rows/:rowId: the row, plus the questionnaire's new status and progress. */
export interface QuestionnaireRowResult extends QuestionnaireRow {
  questionnaireStatus: QuestionnaireStatus
  progress: QuestionnaireProgress
}
