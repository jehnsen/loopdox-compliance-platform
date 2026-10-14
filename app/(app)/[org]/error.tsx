'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/states'

export default function OrgError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Digest only: never log record contents.
    if (error.digest) console.error('Page error', error.digest)
  }, [error])
  return <ErrorState onRetry={reset} />
}
