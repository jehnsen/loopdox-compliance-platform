import type { ListQuery } from '@/lib/api/types'

/** TanStack Query keys. Every key starts with the org slug so switching orgs never mixes data. */
export const qk = {
  me: (org: string | null) => ['me', org] as const,
  members: (org: string, query?: ListQuery) => [org, 'members', query ?? {}] as const,
  notifications: (org: string) => [org, 'notifications'] as const,
  search: (org: string, q: string) => [org, 'search', q] as const,
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
}
