'use client'

import { ErrorState } from '@/components/states'

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16">
      <ErrorState onRetry={reset} />
    </main>
  )
}
