'use client'

import type { ReactNode } from 'react'
import { ConstructionIcon } from 'lucide-react'
import type { Permission } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { PERMISSION_LABELS } from '@/lib/auth/permissions'
import type { Feature } from '@/lib/entitlements'
import { findNavItem } from '@/lib/nav'
import { useOrgSlug } from '@/components/providers/session-provider'
import { Gate } from '@/components/gate'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ForbiddenState } from '@/components/states'

/**
 * Wraps a module page with its permission check (403 state) and plan gate
 * (upgrade card). The server enforces both again on every API call.
 */
export function ModuleGuard({
  permission,
  feature,
  children,
}: {
  permission?: Permission
  feature?: Feature
  children: ReactNode
}) {
  const can = useCan()
  const org = useOrgSlug()
  if (feature) {
    // Plan first: a locked feature shows the upgrade card even to roles that would have access.
    return (
      <Gate feature={feature}>
        {permission && !can(permission) ? (
          <ForbiddenState permissionLabel={PERMISSION_LABELS[permission]} homeHref={`/${org}`} />
        ) : (
          children
        )}
      </Gate>
    )
  }
  if (permission && !can(permission)) {
    return <ForbiddenState permissionLabel={PERMISSION_LABELS[permission]} homeHref={`/${org}`} />
  }
  return <>{children}</>
}

/** Placeholder for module pages that later milestones build. */
export function ModulePlaceholder({ subpath }: { subpath: string }) {
  const found = findNavItem(subpath)
  if (!found) return null
  const { group, item } = found
  const feature = item.feature ?? group.feature
  return (
    <>
      <PageHeader
        title={item.label}
        breadcrumbs={
          group.label !== item.label ? [{ label: group.label }, { label: item.label }] : []
        }
      />
      <ModuleGuard permission={item.permission} feature={feature}>
        <EmptyState
          icon={ConstructionIcon}
          title={`${item.label} is on the way`}
          body={`This page is built in milestone ${item.milestone ?? 'a later milestone'}. Navigation, permissions and plan gating for it already work.`}
        />
      </ModuleGuard>
    </>
  )
}
