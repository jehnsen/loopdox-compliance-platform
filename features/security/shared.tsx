'use client'

import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ShieldAlertIcon } from 'lucide-react'
import { isApiError } from '@/lib/api/client'
import type { AccessLevel, DueState } from '@/lib/api/types'
import { PERMISSION_LABELS } from '@/lib/auth/permissions'
import { ACCESS_LEVEL_LABELS, PRIVILEGED_LEVELS } from '@/lib/security'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug } from '@/components/providers/session-provider'
import type { Crumb } from '@/components/page-header'
import { ErrorState, ForbiddenState, NotFoundState } from '@/components/states'
import { DetailSkeleton } from '@/features/privacy/shared'

export { DuePill, Field, WarningChip } from '@/features/privacy/shared'
export { DetailSkeleton }

/** Breadcrumbs for a security page: Security › Section › …rest. */
export function securityCrumbs(section: Crumb, ...rest: Crumb[]): Crumb[] {
  return [{ label: 'Security' }, section, ...rest]
}

function SecurityForbidden() {
  const org = useOrgSlug()
  return (
    <ForbiddenState permissionLabel={PERMISSION_LABELS['security.read']} homeHref={`/${org}`} />
  )
}

/**
 * Loading, not-found, forbidden and error states for a security record page.
 * Returns null once the record is loaded.
 */
export function recordFallback(query: UseQueryResult<unknown>, listHref: string): ReactNode {
  if (query.isLoading) return <DetailSkeleton />
  if (query.isError || !query.data) {
    const e = query.error
    if (isApiError(e) && e.isNotFound) return <NotFoundState homeHref={listHref} />
    if (isApiError(e) && e.isForbidden) return <SecurityForbidden />
    return <ErrorState onRetry={() => void query.refetch()} />
  }
  return null
}

/** Owner and admin access carries a mark, so privileged grants stand out without colour. */
export function AccessLevelBadge({ level, className }: { level: AccessLevel; className?: string }) {
  const privileged = PRIVILEGED_LEVELS.includes(level)
  return (
    <span
      data-level={level}
      className={cn(
        'inline-flex h-5.5 items-center gap-1 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap',
        privileged ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-muted',
        className,
      )}
    >
      {privileged ? <ShieldAlertIcon className="size-3" aria-hidden="true" /> : null}
      {ACCESS_LEVEL_LABELS[level]}
    </span>
  )
}

/** "Due in 3 d" style cue for a day count, for the trackers that don't use DuePill. */
export function daysPhrase(state: DueState, days: number, due = 'Due'): string {
  if (state === 'overdue') return `Overdue ${-days} d`
  return days === 0 ? `${due} today` : `${due} in ${days} d`
}
