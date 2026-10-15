'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { FileCheck2Icon, PlugIcon, UploadIcon, UserPenIcon, type LucideIcon } from 'lucide-react'
import type { EvidenceItem, EvidenceSource } from '@/lib/api/types'
import { DateText } from '@/components/date-text'
import { FileLink } from '@/components/file-dropzone'
import { EmptyState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'

const SOURCES: Record<EvidenceSource, { label: string; icon: LucideIcon }> = {
  connector: { label: 'Connector', icon: PlugIcon },
  upload: { label: 'Upload', icon: UploadIcon },
  manual: { label: 'Recorded in LoopDox', icon: UserPenIcon },
}

const RESULT_PILLS = {
  pass: { status: 'passing', label: 'Pass' },
  fail: { status: 'failing', label: 'Fail' },
  info: { status: 'pending', label: 'Info' },
} as const

/** A control's evidence, newest first: date, source, result, summary, the record it came from and any file. */
export function EvidenceTimeline({ items }: { items: EvidenceItem[] }) {
  // A link from search or the audit pack lands on one item: scroll it into view.
  const count = items.length
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id && count) document.getElementById(id)?.scrollIntoView({ block: 'center' })
  }, [count])

  if (!items.length) {
    return (
      <EmptyState
        icon={FileCheck2Icon}
        title="No evidence yet"
        body="Evidence from connectors, uploads and completed reviews, such as a signed-off access review, shows up here."
      />
    )
  }
  return (
    <ol aria-label="Evidence timeline" className="flex flex-col" data-testid="evidence-timeline">
      {items.map((e) => {
        const source = SOURCES[e.source]
        const result = RESULT_PILLS[e.result]
        return (
          <li
            key={e.id}
            id={e.id}
            data-testid="evidence-item"
            className="flex scroll-mt-24 flex-col gap-1.5 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0 target:-mx-2 target:rounded-md target:bg-accent-soft target:px-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <DateText value={e.collectedAt} withTime className="font-medium text-fg" />
              <span className="inline-flex items-center gap-1">
                <source.icon className="size-3.5" aria-hidden="true" />
                {source.label}
                {e.connectorName ? ` · ${e.connectorName}` : ''}
              </span>
              <StatusPill status={result.status} label={result.label} />
            </div>
            <p className="text-base">{e.summary}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {e.origin && e.originHref ? (
                <Link href={e.originHref} className="text-accent hover:underline">
                  {e.origin.label}
                </Link>
              ) : null}
              {e.file ? <FileLink file={e.file} /> : null}
              {e.collectedByName ? (
                <span className="text-muted">Recorded by {e.collectedByName}</span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
