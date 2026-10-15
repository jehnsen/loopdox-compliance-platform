import type { ListQuery } from '@/lib/api/types'

/** TanStack Query keys. Every key starts with the org slug so switching orgs never mixes data. */
export const qk = {
  me: (org: string | null) => ['me', org] as const,
  members: (org: string, query?: ListQuery) => [org, 'members', query ?? {}] as const,
  notifications: (org: string) => [org, 'notifications'] as const,
  search: (org: string, q: string, opts?: { types?: string[]; limit?: number }) =>
    [org, 'search', q, opts ?? {}] as const,
  overview: (org: string) => [org, 'overview'] as const,
  auditEvents: (org: string, query?: ListQuery) => [org, 'audit-events', query ?? {}] as const,
  documents: {
    all: (org: string) => [org, 'documents'] as const,
    list: (org: string, query: ListQuery) => [org, 'documents', 'list', query] as const,
    lookup: (org: string) => [org, 'documents', 'lookup'] as const,
    detail: (org: string, id: string) => [org, 'documents', 'detail', id] as const,
    versions: (org: string, id: string) => [org, 'documents', 'versions', id] as const,
    version: (org: string, id: string, v: number) => [org, 'documents', 'version', id, v] as const,
    acknowledgements: (org: string, id: string) => [org, 'documents', 'acks', id] as const,
    nextId: (org: string) => [org, 'documents', 'next-id'] as const,
  },
  controls: (org: string, query: ListQuery) => [org, 'controls', query] as const,
  control: (org: string, id: string) => [org, 'controls', 'detail', id] as const,
  controlEvidence: (org: string, id: string) => [org, 'controls', 'evidence', id] as const,
  /** Every evidence item in the org (Uploads page). Under 'controls' so one invalidation refreshes it. */
  evidenceList: (org: string, query: ListQuery) =>
    [org, 'controls', 'evidence-list', query] as const,
  connectors: (org: string) => [org, 'connectors'] as const,
  auditPack: (org: string, query: ListQuery) => [org, 'audit-pack', query] as const,
  /** Everything security-related lives under [org, 'security'] so one invalidation refreshes lists and details. */
  security: {
    all: (org: string) => [org, 'security'] as const,
    list: (org: string, resource: string, query: ListQuery) =>
      [org, 'security', resource, 'list', query] as const,
    detail: (org: string, resource: string, id: string) =>
      [org, 'security', resource, 'detail', id] as const,
  },
  /** Everything privacy-related lives under [org, 'privacy'] so one invalidation refreshes lists, details and links. */
  privacy: {
    all: (org: string) => [org, 'privacy'] as const,
    list: (org: string, resource: string, query: ListQuery) =>
      [org, 'privacy', resource, 'list', query] as const,
    detail: (org: string, resource: string, id: string) =>
      [org, 'privacy', resource, 'detail', id] as const,
    links: (org: string, type: string, id: string) => [org, 'privacy', 'links', type, id] as const,
    candidates: (org: string, type: string, forRecord: string, q: string) =>
      [org, 'privacy', 'link-candidates', type, forRecord, q] as const,
  },
  ask: {
    threads: (org: string) => [org, 'ask', 'threads'] as const,
    thread: (org: string, id: string) => [org, 'ask', 'thread', id] as const,
  },
  questionnaires: {
    all: (org: string) => [org, 'questionnaires'] as const,
    list: (org: string, query: ListQuery) => [org, 'questionnaires', 'list', query] as const,
    detail: (org: string, id: string) => [org, 'questionnaires', 'detail', id] as const,
  },
}
