import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { DENSITY_COOKIE, THEME_COOKIE } from '@/lib/config'
import type { MeResponse } from '@/lib/api/types'
import { serverGet } from '@/lib/server/api'
import type { ThemePref } from '@/components/shell/theme'

/** /me for an org, fetched once per request. */
export const getMe = cache((org: string | null) =>
  serverGet<MeResponse>(org ? `/me?org=${encodeURIComponent(org)}` : '/me'),
)

export async function getUiPrefs(): Promise<{
  theme: ThemePref
  sidebarCollapsed: boolean
  density: 'comfortable' | 'compact'
}> {
  const jar = await cookies()
  const t = jar.get(THEME_COOKIE)?.value
  return {
    theme: t === 'light' || t === 'dark' ? t : 'system',
    sidebarCollapsed: jar.get('loopdox_sidebar')?.value === 'collapsed',
    density: jar.get(DENSITY_COOKIE)?.value === 'compact' ? 'compact' : 'comfortable',
  }
}
