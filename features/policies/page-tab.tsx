'use client'

import Link from 'next/link'
import { FileTextIcon, PlusIcon } from 'lucide-react'
import type { DocumentDetail } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { CalendarDate } from '@/components/date-text'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { AcknowledgeCard } from '@/features/policies/acknowledge-card'
import { DocStatusPill, ReviewPill } from '@/features/policies/doc-status'
import { policyPaths } from '@/features/policies/paths'
import { TableOfContents } from '@/features/policies/table-of-contents'

function ChildPages({ doc }: { doc: DocumentDetail }) {
  const org = useOrgSlug()
  const can = useCan()
  if (!doc.children.length && !can('policies.edit')) return null
  return (
    <section aria-labelledby="children-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="children-heading" className="text-md font-semibold">
          Pages in this section
        </h2>
        {can('policies.edit') ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={policyPaths.new(org, doc.id)}>
              <PlusIcon aria-hidden="true" /> Add a page here
            </Link>
          </Button>
        ) : null}
      </div>
      {doc.children.length ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[520px] text-base tabular-nums">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th scope="col" className="h-9 px-3 font-semibold">
                  ID
                </th>
                <th scope="col" className="px-3 font-semibold">
                  Title
                </th>
                <th scope="col" className="px-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-3 font-semibold">
                  Next review
                </th>
              </tr>
            </thead>
            <tbody>
              {doc.children.map((c) => (
                <tr key={c.id} className="h-10 border-t border-line">
                  <td className="px-3">
                    <IdChip>{c.docId}</IdChip>
                  </td>
                  <td className="px-3">
                    <Link
                      href={policyPaths.view(org, c.id)}
                      className="font-medium hover:text-accent hover:underline"
                    >
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-3">
                    <DocStatusPill status={c.status} />
                  </td>
                  <td className="px-3">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <CalendarDate value={c.nextReviewDate} />
                      <ReviewPill state={c.reviewState} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

export function PageTab({ doc }: { doc: DocumentDetail }) {
  const content = doc.content
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,calc(72ch+4rem))_14rem]">
      <div className="flex min-w-0 flex-col gap-8">
        <article
          aria-label={`${doc.docId} ${doc.title}`}
          className="max-w-[calc(72ch+4rem)] rounded-lg border border-line bg-surface px-5 py-6 sm:px-8"
        >
          {content?.bodyMarkdown.trim() ? (
            <MarkdownView markdown={content.bodyMarkdown} />
          ) : (
            <EmptyState
              icon={FileTextIcon}
              title="This page is empty"
              body="Edit it to add content."
              className="border-0"
            />
          )}
        </article>
        <ChildPages doc={doc} />
        {content ? <AcknowledgeCard doc={doc} viewingVersion={content.version} /> : null}
      </div>
      {content ? (
        <aside className="hidden xl:block">
          <div className="sticky top-20">
            <TableOfContents markdown={content.bodyMarkdown} />
          </div>
        </aside>
      ) : null}
    </div>
  )
}
