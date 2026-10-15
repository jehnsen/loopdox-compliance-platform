'use client'

import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AlertTriangleIcon, ShieldAlertIcon } from 'lucide-react'
import { isApiError } from '@/lib/api/client'
import type { DueState } from '@/lib/api/types'
import { PERMISSION_LABELS } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug } from '@/components/providers/session-provider'
import type { Crumb } from '@/components/page-header'
import { ErrorState, ForbiddenState, NotFoundState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Skeleton } from '@/components/ui/skeleton'

/** Breadcrumbs for a privacy page: Privacy › Section › …rest. */
export function privacyCrumbs(section: Crumb, ...rest: Crumb[]): Crumb[] {
  return [{ label: 'Privacy' }, section, ...rest]
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-8 w-96 max-w-full" />
      <Skeleton className="h-16" />
      <Skeleton className="h-72" />
    </div>
  )
}

/**
 * Loading, not-found, forbidden and error states for a record page.
 * Returns null once the record is loaded.
 */
export function detailFallback(query: UseQueryResult<unknown>, listHref: string): ReactNode {
  if (query.isLoading) return <DetailSkeleton />
  if (query.isError || !query.data) {
    const e = query.error
    if (isApiError(e) && e.isNotFound) return <NotFoundState homeHref={listHref} />
    if (isApiError(e) && e.isForbidden) return <ForbiddenFallback />
    return <ErrorState onRetry={() => void query.refetch()} />
  }
  return null
}

function ForbiddenFallback() {
  const org = useOrgSlug()
  return <ForbiddenState permissionLabel={PERMISSION_LABELS['privacy.read']} homeHref={`/${org}`} />
}

/** Amber chip with an alert icon: "No PIA", "Retention not set". */
export function WarningChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5.5 items-center gap-1 rounded-sm bg-warn-soft px-1.5 text-xs font-medium whitespace-nowrap text-warn',
        className,
      )}
    >
      <AlertTriangleIcon className="size-3" aria-hidden="true" />
      {children}
    </span>
  )
}

/** Red-outlined chip marking sensitive personal information. */
export function SensitiveChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-sm border border-bad/40 px-1.5 text-2xs font-semibold tracking-[0.04em] text-bad uppercase',
        className,
      )}
    >
      <ShieldAlertIcon className="size-3" aria-hidden="true" />
      Sensitive
    </span>
  )
}

/** "Due in 2 d" / "Due today" / "Overdue 3 d" for a calendar deadline. */
export function DuePill({
  state,
  days,
  verb = 'Due',
}: {
  state: DueState | null
  days: number | null
  /** "Due", "Renews", "Expires". */
  verb?: string
}) {
  if (state === null || days === null) return null
  if (state === 'overdue') {
    return (
      <StatusPill status="overdue" label={`${verb === 'Due' ? 'Overdue' : 'Expired'} ${-days} d`} />
    )
  }
  const label = days === 0 ? `${verb} today` : `${verb} in ${days} d`
  return <StatusPill status={state === 'due_soon' ? 'due_soon' : 'active'} label={label} />
}

/** A labelled block of read-only content inside a card. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label-caps">{label}</dt>
      <dd className="text-base">{children}</dd>
    </div>
  )
}
