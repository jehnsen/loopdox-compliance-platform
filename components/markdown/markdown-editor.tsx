'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarkdownEditorProps } from '@/components/markdown/markdown-editor-impl'

/** CodeMirror is large: load it only on pages that edit Markdown. */
export const MarkdownEditor = dynamic<MarkdownEditorProps>(
  () => import('@/components/markdown/markdown-editor-impl'),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3" aria-busy="true">
        <span className="sr-only">Loading editor…</span>
        <Skeleton className="h-6 w-80" />
        <Skeleton className="h-96" />
      </div>
    ),
  },
)
