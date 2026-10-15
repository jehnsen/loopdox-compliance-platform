'use client'

import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { isApiError } from '@/lib/api/client'
import { PERMISSION_LABELS } from '@/lib/auth/permissions'
import { useOrgSlug } from '@/components/providers/session-provider'
import type { Crumb } from '@/components/page-header'
import { ErrorState, ForbiddenState, NotFoundState } from '@/components/states'
import { DetailSkeleton } from '@/features/privacy/shared'

export const aiPaths = {
  overview: (org: string) => `/${org}/ai-governance`,
  inventory: (org: string) => `/${org}/ai-governance/inventory`,
  useCaseNew: (org: string) => `/${org}/ai-governance/inventory/new`,
  useCase: (org: string, id: string) => `/${org}/ai-governance/inventory/${id}`,
  useCaseEdit: (org: string, id: string) => `/${org}/ai-governance/inventory/${id}/edit`,
  assessments: (org: string) => `/${org}/ai-governance/assessments`,
  assessment: (org: string, id: string) => `/${org}/ai-governance/assessments/${id}`,
  profiles: (org: string) => `/${org}/ai-governance/profiles`,
  keys: (org: string) => `/${org}/ai-governance/keys`,
  events: (org: string, query = '') => `/${org}/ai-governance/events${query}`,
}

/** Breadcrumbs for an AI Governance page: AI Governance › Section › …rest. */
export function aiCrumbs(section: Crumb | null, ...rest: Crumb[]): Crumb[] {
  return [{ label: 'AI Governance' }, ...(section ? [section] : []), ...rest]
}

function AiForbidden() {
  const org = useOrgSlug()
  return <ForbiddenState permissionLabel={PERMISSION_LABELS['ai.read']} homeHref={`/${org}`} />
}

/**
 * Loading, not-found, forbidden and error states for an AI Governance record page.
 * Returns null once the record is loaded.
 */
export function recordFallback(query: UseQueryResult<unknown>, homeHref: string): ReactNode {
  if (query.isLoading) return <DetailSkeleton />
  if (query.isError || !query.data) {
    const e = query.error
    if (isApiError(e) && e.isNotFound) return <NotFoundState homeHref={homeHref} />
    if (isApiError(e) && e.isForbidden) return <AiForbidden />
    return <ErrorState onRetry={() => void query.refetch()} />
  }
  return null
}
