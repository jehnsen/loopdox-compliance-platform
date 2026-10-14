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

export interface SearchResponse {
  q: string
  groups: { type: SearchResultType; label: string; items: SearchResult[] }[]
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
// Controls (full Evidence module arrives in M6)
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
