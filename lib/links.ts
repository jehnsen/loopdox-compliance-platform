import type { Permission, RecordType } from '@/lib/api/types'
import type { Feature } from '@/lib/entitlements'

/**
 * Which records link to which, and which side stores the link. Shared by the
 * mock API (the backend must implement the same table) and LinkedRecords.
 *
 * Each relation is stored on `owner` in `field`. From the owner's page the link
 * points "to" the target; from the target's page it comes "from" the owner.
 */
export interface LinkRelation {
  owner: RecordType
  field: string
  target: RecordType
  /** One target only (a PIA covers one processing activity). */
  single?: boolean
  /** Managed by the owner's own form, not by Link existing / Remove. */
  managed?: boolean
}

export const LINK_RELATIONS: readonly LinkRelation[] = [
  { owner: 'processing_activity', field: 'systemIds', target: 'system' },
  { owner: 'processing_activity', field: 'agreementIds', target: 'agreement' },
  {
    owner: 'pia',
    field: 'processingActivityId',
    target: 'processing_activity',
    single: true,
    managed: true,
  },
  { owner: 'dsr', field: 'processingActivityIds', target: 'processing_activity' },
  { owner: 'incident', field: 'processingActivityIds', target: 'processing_activity' },
  { owner: 'incident', field: 'systemIds', target: 'system' },
  { owner: 'incident', field: 'documentIds', target: 'document' },
  { owner: 'incident', field: 'riskIds', target: 'risk' },
  // Security (M5). Grants, secrets and changes point at one system; ADRs at several.
  { owner: 'access_grant', field: 'systemId', target: 'system', single: true, managed: true },
  { owner: 'secret_record', field: 'systemId', target: 'system', single: true, managed: true },
  { owner: 'change', field: 'systemId', target: 'system', single: true, managed: true },
  { owner: 'decision', field: 'systemIds', target: 'system' },
  { owner: 'risk', field: 'documentIds', target: 'document' },
  { owner: 'risk', field: 'controlIds', target: 'control' },
]

/** Permission needed to add or remove links stored on records of this type. */
export function linkPermission(owner: RecordType): Permission {
  switch (owner) {
    case 'access_grant':
    case 'secret_record':
    case 'change':
    case 'decision':
    case 'risk':
    case 'system':
      return 'security.edit'
    default:
      return 'privacy.edit'
  }
}

export const RECORD_LABELS: Record<RecordType, { one: string; many: string }> = {
  document: { one: 'Policy', many: 'Policies' },
  processing_activity: { one: 'Processing record', many: 'Processing records' },
  pia: { one: 'Impact assessment', many: 'Impact assessments' },
  dsr: { one: 'Data subject request', many: 'Data subject requests' },
  incident: { one: 'Incident', many: 'Incidents' },
  agreement: { one: 'Agreement', many: 'Agreements' },
  system: { one: 'System', many: 'Systems' },
  risk: { one: 'Risk', many: 'Risks' },
  access_grant: { one: 'Access grant', many: 'Access grants' },
  secret_record: { one: 'Secret', many: 'Secrets' },
  change: { one: 'Change', many: 'Changes' },
  decision: { one: 'Decision', many: 'Decisions' },
  control: { one: 'Control', many: 'Controls' },
}

/** Plan feature each record type belongs to; links to a type the plan lacks are hidden. */
export const RECORD_FEATURES: Record<RecordType, Feature> = {
  document: 'policies',
  processing_activity: 'privacy',
  pia: 'privacy',
  dsr: 'privacy',
  incident: 'privacy',
  agreement: 'privacy',
  system: 'security',
  risk: 'security',
  access_grant: 'security',
  secret_record: 'security',
  change: 'security',
  decision: 'security',
  control: 'evidence',
}

/** App path of a record's detail page. */
export function recordHref(org: string, type: RecordType, id: string): string {
  const base = `/${org}`
  switch (type) {
    case 'document':
      return `${base}/policies/${id}`
    case 'processing_activity':
      return `${base}/privacy/processing/${id}`
    case 'pia':
      return `${base}/privacy/pia/${id}`
    case 'dsr':
      return `${base}/privacy/requests/${id}`
    case 'incident':
      return `${base}/privacy/incidents/${id}`
    case 'agreement':
      return `${base}/privacy/agreements/${id}`
    case 'system':
      return `${base}/security/assets/${id}`
    case 'risk':
      return `${base}/security/risks/${id}`
    case 'access_grant':
      return `${base}/security/access`
    case 'secret_record':
      return `${base}/security/secrets`
    case 'change':
      return `${base}/security/changes`
    case 'decision':
      return `${base}/security/decisions/${id}`
    case 'control':
      return `${base}/evidence/controls/${id}`
  }
}

export interface RelationView {
  relation: LinkRelation
  /** The record type on the other end. */
  other: RecordType
  direction: 'to' | 'from'
}

/** Every relation a record of `type` takes part in, from its own point of view. */
export function relationsFor(type: RecordType): RelationView[] {
  const out: RelationView[] = []
  for (const relation of LINK_RELATIONS) {
    if (relation.owner === type) out.push({ relation, other: relation.target, direction: 'to' })
    else if (relation.target === type)
      out.push({ relation, other: relation.owner, direction: 'from' })
  }
  return out
}

/** The relation between two types, oriented so `owner` holds the link. */
export function findRelation(
  a: RecordType,
  b: RecordType,
): { relation: LinkRelation; ownerIsA: boolean } | null {
  for (const relation of LINK_RELATIONS) {
    if (relation.owner === a && relation.target === b) return { relation, ownerIsA: true }
    if (relation.owner === b && relation.target === a) return { relation, ownerIsA: false }
  }
  return null
}
