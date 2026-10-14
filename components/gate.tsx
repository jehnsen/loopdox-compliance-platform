'use client'

import type { ReactNode } from 'react'
import { featureCap, hasFeature, type Feature } from '@/lib/entitlements'
import { useSession } from '@/components/providers/session-provider'
import { UpgradeCard } from '@/components/upgrade-card'

export function useEntitlement(feature: Feature): { enabled: boolean; cap: number | null } {
  const { tier } = useSession()
  return { enabled: hasFeature(tier, feature), cap: featureCap(tier, feature) }
}

/** Renders children if the org's plan includes `feature`; otherwise an upgrade card. */
export function Gate({
  feature,
  children,
  fallback,
}: {
  feature: Feature
  children: ReactNode
  fallback?: ReactNode
}) {
  const { enabled } = useEntitlement(feature)
  if (enabled) return <>{children}</>
  return <>{fallback ?? <UpgradeCard feature={feature} />}</>
}
