'use client'

import { useCallback, type ReactNode } from 'react'
import type { Permission } from '@/lib/api/types'
import { can, type Resource } from '@/lib/auth/permissions'
import { useSession } from '@/components/providers/session-provider'

/** Returns a `can(action, resource?)` bound to the current user's roles in this org. */
export function useCan(): (action: Permission, resource?: Resource) => boolean {
  const { roles } = useSession()
  return useCallback((action, resource) => can({ roles }, action, resource), [roles])
}

/** Renders children only if the current user may perform `action`. */
export function Can({
  action,
  resource,
  fallback = null,
  children,
}: {
  action: Permission
  resource?: Resource
  fallback?: ReactNode
  children: ReactNode
}) {
  const allowed = useCan()(action, resource)
  return <>{allowed ? children : fallback}</>
}
