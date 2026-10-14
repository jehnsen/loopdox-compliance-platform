'use client'

import { ErrorState } from '@/components/states'

export default function AuthError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState onRetry={reset} />
}
