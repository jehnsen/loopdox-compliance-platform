'use client'

import Link from 'next/link'
import { LibraryIcon } from 'lucide-react'
import type { Citation } from '@/lib/api/types'
import { VersionChip } from '@/components/chips'
import { CITATION_ICON } from '@/features/ask/meta'

const KIND_LABEL: Record<Citation['kind'], string> = {
  policy_section: 'Policy section',
  record: 'Record',
  evidence: 'Evidence',
}

/** Every citation behind the selected answer, in order. */
export function SourcesPanel({
  citations,
  onNavigate,
}: {
  citations: Citation[]
  onNavigate?: () => void
}) {
  return (
    <section aria-labelledby="sources-heading" className="flex flex-col gap-3">
      <h2 id="sources-heading" className="label-caps">
        Sources{citations.length ? ` (${citations.length})` : ''}
      </h2>
      {citations.length ? (
        <ol className="flex flex-col gap-2" aria-label="Sources for the selected answer">
          {citations.map((c) => {
            const Icon = CITATION_ICON[c.kind]
            return (
              <li key={c.n} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-start gap-2">
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm bg-accent-soft px-1 text-xs font-semibold text-accent tabular-nums">
                    {c.n}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      href={c.href}
                      onClick={onNavigate}
                      className="text-sm font-medium hover:text-accent hover:underline"
                    >
                      {c.label}
                    </Link>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Icon className="size-3.5" aria-hidden="true" />
                      {KIND_LABEL[c.kind]}
                      {c.version ? <VersionChip version={c.version} /> : null}
                    </span>
                    {c.excerpt ? (
                      <blockquote className="line-clamp-4 border-l-2 border-line pl-2 text-sm text-muted">
                        {c.excerpt}
                      </blockquote>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="flex items-start gap-2 text-sm text-muted">
          <LibraryIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          The sources behind an answer appear here. Every statement Ask makes links to the passage
          it came from.
        </p>
      )}
    </section>
  )
}
