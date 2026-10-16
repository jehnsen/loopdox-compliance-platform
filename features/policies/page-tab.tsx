'use client'

import Link from 'next/link'
import {
  ArchiveIcon,
  ArrowUpIcon,
  FilePenLineIcon,
  FileTextIcon,
  PlusIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from 'lucide-react'
import type { DocumentDetail, DocumentVersion } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { CalendarDate, DateText } from '@/components/date-text'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { AcknowledgeCard } from '@/features/policies/acknowledge-card'
import { DocStatusPill, ReviewPill } from '@/features/policies/doc-status'
import { versionTypeLabel } from '@/features/policies/history-tab'
import { policyPaths } from '@/features/policies/paths'
import { TableOfContents } from '@/features/policies/table-of-contents'

const BODY_ID = 'policy-body'

function ChildPages({ doc }: { doc: DocumentDetail }) {
  const org = useOrgSlug()
  const can = useCan()
  if (!doc.children.length && !can('policies.edit')) return null
  return (
    <section aria-labelledby="children-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="children-heading" className="text-md font-semibold tracking-tight">
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
            <thead className="bg-surface-2/60 text-left text-2xs tracking-[0.06em] text-muted uppercase">
              <tr>
                <th scope="col" className="h-9 px-4 font-semibold">
                  ID
                </th>
                <th scope="col" className="px-4 font-semibold">
                  Title
                </th>
                <th scope="col" className="px-4 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 font-semibold">
                  Next review
                </th>
              </tr>
            </thead>
            <tbody>
              {doc.children.map((c) => (
                <tr
                  key={c.id}
                  className="h-11 border-t border-line transition-colors hover:bg-surface-2/50"
                >
                  <td className="px-4">
                    <IdChip>{c.docId}</IdChip>
                  </td>
                  <td className="px-4">
                    <Link
                      href={policyPaths.view(org, c.id)}
                      className="font-medium transition-colors hover:text-accent"
                    >
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-4">
                    <DocStatusPill status={c.status} />
                  </td>
                  <td className="px-4">
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

interface ControlStamp {
  icon: LucideIcon
  label: string
  className: string
}

/** Whether the text on screen is the copy in force: the first thing a reader of a controlled document checks. */
function controlStamp(doc: DocumentDetail, version: number): ControlStamp {
  if (doc.status === 'retired')
    return { icon: ArchiveIcon, label: 'Retired · kept for reference', className: 'text-muted' }
  if (doc.approvedVersion === version)
    return { icon: ShieldCheckIcon, label: 'Controlled copy · in force', className: 'text-ok' }
  if (!doc.requiresApproval)
    return { icon: FileTextIcon, label: 'Published · no approval needed', className: 'text-muted' }
  return {
    icon: FilePenLineIcon,
    label: doc.status === 'in_review' ? 'In review · not yet in force' : 'Draft · not yet in force',
    className: 'text-warn',
  }
}

/** The page body framed as a controlled document: identity on top, provenance below. */
function DocumentSheet({ doc, content }: { doc: DocumentDetail; content: DocumentVersion | null }) {
  const version = content?.version ?? doc.currentVersion
  const stamp = controlStamp(doc, version)
  const approvedHere = doc.approvedVersion === version && doc.approvedByName
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-line bg-surface-2/40 px-5 py-2.5 sm:px-10">
        <span className="flex items-center gap-2 font-mono text-xs text-muted">
          <span className="font-medium text-fg">{doc.docId}</span>
          <span aria-hidden="true">·</span>
          <span>Version {version}</span>
        </span>
        <span
          data-testid="control-stamp"
          className={cn('flex items-center gap-1.5 text-xs font-medium', stamp.className)}
        >
          <stamp.icon className="size-3.5" aria-hidden="true" />
          {stamp.label}
        </span>
      </div>
      <article
        id={BODY_ID}
        aria-label={`${doc.docId} ${doc.title}`}
        className="px-5 py-8 sm:px-10 sm:py-10"
      >
        {content?.bodyMarkdown.trim() ? (
          <MarkdownView markdown={content.bodyMarkdown} />
        ) : (
          <EmptyState
            icon={FileTextIcon}
            title="This page is empty"
            body="Edit it to add content."
            className="border-0 bg-transparent"
          />
        )}
      </article>
      {content ? (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-t border-line bg-surface-2/40 px-5 py-3 text-sm text-muted sm:px-10">
          <span className="min-w-0">
            {versionTypeLabel(content)} by <span className="text-fg">{content.authorName}</span>{' '}
            <DateText value={content.createdAt} />
            {content.changeSummary ? (
              <span className="hidden md:inline"> · “{content.changeSummary}”</span>
            ) : null}
          </span>
          {approvedHere ? (
            <span className="flex items-center gap-1.5">
              <ShieldCheckIcon className="size-3.5 shrink-0 text-ok" aria-hidden="true" />
              <span>
                Approved by <span className="text-fg">{doc.approvedByName}</span>
                {doc.approvedAt ? (
                  <>
                    {' '}
                    <DateText value={doc.approvedAt} />
                  </>
                ) : null}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function PageTab({ doc }: { doc: DocumentDetail }) {
  const content = doc.content
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,calc(72ch+5rem))_15rem]">
      <div className="flex min-w-0 flex-col gap-8">
        <div className="max-w-[calc(72ch+5rem)]">
          <DocumentSheet doc={doc} content={content} />
        </div>
        <ChildPages doc={doc} />
        {content ? <AcknowledgeCard doc={doc} viewingVersion={content.version} /> : null}
      </div>
      {content ? (
        <aside className="hidden xl:block">
          <div className="sticky top-20 flex flex-col gap-6">
            <TableOfContents markdown={content.bodyMarkdown} progressTargetId={BODY_ID} />
            <a
              href="#main"
              className="flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
            >
              <ArrowUpIcon className="size-3.5" aria-hidden="true" />
              Back to top
            </a>
          </div>
        </aside>
      ) : null}
    </div>
  )
}
