'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

/** The diff view (and jsdiff) load only when a diff is shown. */
export const LazyDiffView = dynamic(() => import('@/components/diff-view'), {
  ssr: false,
  loading: () => <Skeleton className="h-64" />,
})
