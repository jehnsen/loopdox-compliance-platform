'use client'

import { useSyncExternalStore } from 'react'

/**
 * Current time, shared by every subscriber and refreshed every `TICK_MS`.
 * Returns null during server render and hydration, so time-dependent text
 * never causes a hydration mismatch.
 */
const TICK_MS = 15_000

let now: number | null = null
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now()
      for (const l of listeners) l()
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

function getSnapshot(): number {
  now ??= Date.now()
  return now
}

function getServerSnapshot(): null {
  return null
}

export function useNow(): Date | null {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return ms === null ? null : new Date(ms)
}
