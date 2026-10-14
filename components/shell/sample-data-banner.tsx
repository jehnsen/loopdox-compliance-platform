'use client'

import { useSyncExternalStore } from 'react'
import { FlaskConicalIcon, XIcon } from 'lucide-react'
import { en } from '@/lib/i18n/en'
import { useSession } from '@/components/providers/session-provider'

const KEY = 'loopdox.sampleBannerDismissed'
const EVENT = 'loopdox:sample-banner'
/** Fallback when sessionStorage is blocked: dismissal lasts until reload. */
let dismissedInMemory = false

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}

function isDismissed(): boolean {
  if (dismissedInMemory) return true
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Shown in mock mode until dismissed for this browser session. */
export function SampleDataBanner() {
  const { apiMode } = useSession()
  // Hidden during server render; appears after hydration unless dismissed.
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true)
  if (apiMode !== 'mock' || dismissed) return null
  return (
    <div
      role="note"
      data-testid="sample-data-banner"
      className="flex items-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-sm text-fg lg:px-8"
    >
      <FlaskConicalIcon className="size-4 shrink-0 text-warn" aria-hidden="true" />
      <p className="flex-1">{en.shell.sampleDataBanner}</p>
      <button
        type="button"
        onClick={() => {
          dismissedInMemory = true
          try {
            sessionStorage.setItem(KEY, '1')
          } catch {
            // Storage unavailable: the in-memory flag covers this page view.
          }
          window.dispatchEvent(new Event(EVENT))
        }}
        className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-fg"
        aria-label={en.shell.dismiss}
      >
        <XIcon className="size-4" />
      </button>
    </div>
  )
}
