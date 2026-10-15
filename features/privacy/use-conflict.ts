'use client'

import { useState } from 'react'
import type { ConflictTheirs } from '@/components/conflict-dialog'
import { toastError } from '@/lib/utils/toast-error'

interface Versioned {
  version: number
  updatedAt: string
  updatedByName: string
}

/**
 * 409 handling for record forms: fetches the latest saved record and describes it
 * as "Label: value" lines, so ConflictDialog can diff it against the user's edit.
 */
export function useRecordConflict<T extends Versioned>(
  fetchLatest: () => Promise<T>,
  describe: (record: T) => string,
) {
  const [state, setState] = useState<{ open: boolean; latest: T | null }>({
    open: false,
    latest: null,
  })

  const open = async () => {
    setState({ open: true, latest: null })
    try {
      setState({ open: true, latest: await fetchLatest() })
    } catch (e) {
      setState({ open: false, latest: null })
      toastError(e)
    }
  }

  const theirs: ConflictTheirs | null = state.latest
    ? {
        version: state.latest.version,
        updatedByName: state.latest.updatedByName,
        updatedAt: state.latest.updatedAt,
        text: describe(state.latest),
        label: 'Saved version',
      }
    : null

  return {
    open: state.open,
    latest: state.latest,
    theirs,
    start: () => void open(),
    setOpen: (o: boolean) => setState((s) => ({ ...s, open: o })),
    close: () => setState({ open: false, latest: null }),
  }
}
