'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { DENSITY_COOKIE } from '@/lib/config'

export type Density = 'comfortable' | 'compact'

interface UiPrefs {
  density: Density
  setDensity: (d: Density) => void
}

const UiPrefsContext = createContext<UiPrefs>({
  density: 'comfortable',
  setDensity: () => undefined,
})

/** Per-user display preferences, persisted in non-sensitive cookies so the server renders them. */
export function UiPrefsProvider({
  initialDensity,
  children,
}: {
  initialDensity: Density
  children: ReactNode
}) {
  const [density, setDensityState] = useState<Density>(initialDensity)
  const setDensity = useCallback((d: Density) => {
    setDensityState(d)
    document.cookie = `${DENSITY_COOKIE}=${d}; path=/; max-age=31536000; samesite=lax`
  }, [])
  const value = useMemo(() => ({ density, setDensity }), [density, setDensity])
  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>
}

export function useUiPrefs(): UiPrefs {
  return useContext(UiPrefsContext)
}
