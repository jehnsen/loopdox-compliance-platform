import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SearchPage } from '@/features/search/search-page'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = { title: 'Search' }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <SearchPage />
    </Suspense>
  )
}
