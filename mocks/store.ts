import fs from 'node:fs'
import path from 'node:path'
import type {
  AccessGrant,
  AiAssessment,
  AiEvent,
  AiProfile,
  AiProviderKey,
  AiProxyStatus,
  AiStatsDay,
  AiUseCase,
  AccessReview,
  Acknowledgement,
  AskMessage,
  BaseEntity,
  QuestionnaireFormat,
  QuestionnaireMapping,
  QuestionnaireRow,
  Agreement,
  Change,
  AuditEvent,
  Connector,
  Control,
  Decision,
  Document,
  Dsr,
  DsrEvent,
  Evidence,
  FileRef,
  Incident,
  IncidentNotices,
  Notification,
  Org,
  Pia,
  ProcessingActivity,
  Registration,
  Risk,
  Role,
  SecretRecord,
  System,
  TrainingRecord,
  User,
  WorkflowEvent,
} from '@/lib/api/types'
import { seedDatabase, SEED_VERSION } from '@/mocks/seed'

/**
 * In-memory store for the mock API. In development it is persisted to
 * .mock-db.json (gitignored) so data survives restarts; `pnpm mock:reset` reseeds.
 *
 * The store lives on globalThis so route handlers and server components in the
 * same process share one copy.
 */

export interface MockUser extends User {
  /** Mock only. Every seeded user shares the demo password. */
  password: string
}

export interface MockMembership {
  id: string
  orgId: string
  userId: string
  roles: Role[]
  status: 'active' | 'invited'
  expiresAt: string | null
  invitedAt: string | null
  joinedAt: string | null
  version: number
}

export interface MockInvite {
  token: string
  orgId: string
  email: string
  roles: Role[]
  invitedBy: string
  expiresAt: string
  acceptedAt: string | null
}

export interface MockUsage {
  orgId: string
  /** "2026-10" */
  month: string
  askQuestions: number
}

export interface MockDB {
  meta: { seedVersion: number; seededAt: string }
  orgs: Org[]
  users: MockUser[]
  memberships: MockMembership[]
  invites: MockInvite[]
  resetTokens: { token: string; userId: string; expiresAt: string }[]
  notifications: Notification[]
  auditEvents: AuditEvent[]
  usage: MockUsage[]
  documents: Document[]
  documentVersions: MockDocumentVersion[]
  workflowEvents: Omit<WorkflowEvent, 'actorName'>[]
  acknowledgements: Acknowledgement[]
  controls: Control[]
  systems: System[]
  risks: Risk[]
  accessGrants: AccessGrant[]
  accessReviews: AccessReview[]
  secrets: SecretRecord[]
  changes: Change[]
  decisions: Decision[]
  evidence: Evidence[]
  connectors: Connector[]
  aiUseCases: AiUseCase[]
  aiAssessments: AiAssessment[]
  aiProfiles: AiProfile[]
  aiKeys: AiProviderKey[]
  aiEvents: AiEvent[]
  aiDays: MockAiDay[]
  aiProxy: MockAiProxy[]
  files: MockFile[]
  documentImages: MockDocumentImage[]
  processingActivities: ProcessingActivity[]
  pias: Pia[]
  dsrs: MockDsr[]
  incidents: MockIncident[]
  agreements: Agreement[]
  registrations: Registration[]
  trainingRecords: TrainingRecord[]
  askThreads: MockAskThread[]
  askMessages: MockAskMessage[]
  questionnaires: MockQuestionnaire[]
}

export interface MockAskThread {
  id: string
  orgId: string
  userId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface MockAskMessage extends AskMessage {
  orgId: string
  userId: string
}

/** Stored questionnaire: the parsed file (header + rows) and the reviewed answers. */
export interface MockQuestionnaire extends BaseEntity {
  name: string
  client: string
  fileName: string
  format: QuestionnaireFormat
  sheetName: string
  uploadedAt: string
  uploadedBy: string
  header: string[]
  /** Data rows under the header, as parsed. */
  cells: string[][]
  mapping: QuestionnaireMapping | null
  rows: (Omit<QuestionnaireRow, 'editorName'> & { version: number; cellRow: number })[]
}

/** One day of proxy statistics, with the blocked count split by reason. */
export interface MockAiDay extends AiStatsDay {
  orgId: string
  reasons: Record<string, number>
}

export interface MockAiProxy {
  orgId: string
  status: AiProxyStatus
  latencyP95Ms: number
  uptimePct: number
  note: string
  checkedAt: string
}

/** Upload metadata. The mock keeps no file contents. */
export interface MockFile extends FileRef {
  orgId: string
}

/** Stored DSR: the requester's real details, file IDs and the timeline. Responses mask the requester. */
export interface MockDsr extends Omit<Dsr, 'requesterName' | 'requesterContact' | 'files'> {
  requester: { name: string; contact: string }
  fileIds: string[]
  events: Omit<DsrEvent, 'byName'>[]
}

export type MockNotices = Omit<IncidentNotices, 'draftedByName' | 'signedOffByName'>

export interface MockIncident extends Omit<Incident, 'notices'> {
  notices: MockNotices | null
}

/** An image used in policy pages, with its bytes (base64) so the mock can serve it. */
export interface MockDocumentImage {
  id: string
  orgId: string
  name: string
  size: number
  contentType: string
  data: string
  uploadedAt: string
  uploadedBy: string
}

/** Stored version: names are resolved when returned. */
export interface MockDocumentVersion {
  id: string
  orgId: string
  documentId: string
  version: number
  title: string
  bodyMarkdown: string
  changeSummary: string
  type: 'create' | 'edit' | 'restore'
  restoredFrom: number | null
  author: string
  createdAt: string
}

// Dev-only file (never written in production builds), so keep it out of output tracing.
const DB_FILE = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  process.env.MOCK_DB_FILE ?? '.mock-db.json',
)

const shouldPersist = () =>
  process.env.MOCK_PERSIST !== '0' && process.env.NODE_ENV !== 'production' && !process.env.VITEST

type GlobalWithStore = typeof globalThis & {
  __loopdoxMockDb?: MockDB
  __loopdoxMockPersistTimer?: ReturnType<typeof setTimeout>
}
const g = globalThis as GlobalWithStore

function load(): MockDB {
  if (shouldPersist() && fs.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as MockDB
      if (data.meta?.seedVersion === SEED_VERSION) return data
    } catch {
      // Corrupt or partial file: fall through and reseed.
    }
  }
  const db = seedDatabase(new Date())
  writeNow(db)
  return db
}

function writeNow(db: MockDB): void {
  if (!shouldPersist()) return
  fs.writeFileSync(DB_FILE, JSON.stringify(db), 'utf8')
}

export function getDb(): MockDB {
  g.__loopdoxMockDb ??= load()
  return g.__loopdoxMockDb
}

/** Schedule a write of the current store to disk. Call after every mutation. */
export function commit(): void {
  if (!shouldPersist()) return
  if (g.__loopdoxMockPersistTimer) clearTimeout(g.__loopdoxMockPersistTimer)
  g.__loopdoxMockPersistTimer = setTimeout(() => {
    if (g.__loopdoxMockDb) writeNow(g.__loopdoxMockDb)
  }, 150)
}

/** Replace the store with fresh seed data. */
export function resetDb(now: Date = new Date()): MockDB {
  g.__loopdoxMockDb = seedDatabase(now)
  writeNow(g.__loopdoxMockDb)
  return g.__loopdoxMockDb
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}
