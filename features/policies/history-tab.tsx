'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ExternalLinkIcon, HistoryIcon, RotateCcwIcon } from 'lucide-react'
import {
  useDocumentVersion,
  useDocumentVersions,
  useRestoreVersion,
} from '@/lib/api/hooks/use-documents'
import type { DocumentDetail, DocumentVersionSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { cn } from '@/lib/utils/cn'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { VersionChip } from '@/components/chips'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateText } from '@/components/date-text'
import { LazyDiffView } from '@/components/diff-view-lazy'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { EmptyState, ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { policyPaths } from '@/features/policies/paths'

export function versionTypeLabel(v: DocumentVersionSummary): string {
  if (v.type === 'create') return 'Created'
  if (v.type === 'restore') return `Restored from v${v.restoredFrom}`
  return 'Edited'
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-md border border-line bg-surface p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-6 rounded-sm px-2.5 text-sm text-muted hover:text-fg',
            value === o.value && 'bg-accent-soft font-medium text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Diff of `version` against the one before it, or its full text. */
export function VersionCompare({
  doc,
  version,
  mode,
  diffMode,
  onModeChange,
  onDiffModeChange,
}: {
  doc: DocumentDetail
  version: number
  mode: 'changes' | 'full'
  diffMode: 'unified' | 'split'
  onModeChange: (m: 'changes' | 'full') => void
  onDiffModeChange: (m: 'unified' | 'split') => void
}) {
  const org = useOrgSlug()
  const current = useDocumentVersion(org, doc.id, version)
  const previous = useDocumentVersion(org, doc.id, version > 1 ? version - 1 : null)
  const showChanges = mode === 'changes' && version > 1
  if (current.isError || previous.isError) {
    return (
      <ErrorState
        title="Couldn’t load this version"
        onRetry={() => void (current.refetch(), previous.refetch())}
      />
    )
  }
  const loading = current.isLoading || (showChanges && previous.isLoading)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {version > 1 ? (
          <Segmented
            label="Show"
            value={mode}
            onChange={onModeChange}
            options={[
              { value: 'changes', label: `Changes from v${version - 1}` },
              { value: 'full', label: 'Full text' },
            ]}
          />
        ) : (
          <p className="text-sm text-muted">
            The first version. There’s nothing earlier to compare with.
          </p>
        )}
        {showChanges ? (
          <Segmented
            label="Diff layout"
            value={diffMode}
            onChange={onDiffModeChange}
            options={[
              { value: 'unified', label: 'Unified' },
              { value: 'split', label: 'Side by side' },
            ]}
          />
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="h-80" />
      ) : showChanges && current.data && previous.data ? (
        <>
          {current.data.title !== previous.data.title ? (
            <p className="text-sm">
              Title changed from <span className="line-through">{previous.data.title}</span> to{' '}
              <span className="font-medium">{current.data.title}</span>.
            </p>
          ) : null}
          <LazyDiffView
            oldText={previous.data.bodyMarkdown}
            newText={current.data.bodyMarkdown}
            oldLabel={`v${version - 1}`}
            newLabel={`v${version}`}
            mode={diffMode}
          />
        </>
      ) : current.data ? (
        <article className="rounded-lg border border-line bg-surface px-5 py-6 sm:px-8">
          <MarkdownView markdown={current.data.bodyMarkdown} className="max-w-reading" />
        </article>
      ) : null}
    </div>
  )
}

export function HistoryTab({ doc }: { doc: DocumentDetail }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const versions = useDocumentVersions(org, doc.id)
  const restore = useRestoreVersion(org, doc.id)
  const [confirm, setConfirm] = useState<number | null>(null)

  const selected = Number(searchParams.get('v')) || doc.currentVersion
  const mode = searchParams.get('show') === 'full' ? 'full' : 'changes'
  const diffMode = searchParams.get('diff') === 'split' ? 'split' : 'unified'

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    router.replace(`${pathname}?${next}`, { scroll: false })
  }

  if (versions.isLoading) return <Skeleton className="h-96" />
  if (versions.isError)
    return (
      <ErrorState
        title="Couldn’t load the version history"
        onRetry={() => void versions.refetch()}
      />
    )
  const items = versions.data?.items ?? []
  if (!items.length) return <EmptyState icon={HistoryIcon} title="No versions yet" />
  const canRestore = can('policies.edit') && doc.status !== 'retired'

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <ol className="flex flex-col gap-1" aria-label="Versions">
        {items.map((v) => {
          const isSelected = v.version === selected
          return (
            <li key={v.id}>
              <button
                type="button"
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => setParam({ v: String(v.version) })}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left',
                  isSelected
                    ? 'border-accent/50 bg-accent-soft'
                    : 'border-transparent hover:bg-surface-2',
                )}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <VersionChip version={v.version} />
                  <span className="text-sm font-medium">{versionTypeLabel(v)}</span>
                  {v.version === doc.approvedVersion ? (
                    <span className="rounded-sm bg-ok-soft px-1.5 text-xs font-medium text-ok">
                      Approved
                    </span>
                  ) : null}
                  {v.version === doc.currentVersion && v.version !== doc.approvedVersion ? (
                    <span className="rounded-sm bg-surface-2 px-1.5 text-xs font-medium text-muted">
                      Current
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 text-sm">{v.changeSummary}</span>
                <span className="text-xs text-muted">
                  {v.authorName} · <DateText value={v.createdAt} relative />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-md font-semibold">
            v{selected}
            {selected === doc.currentVersion ? (
              <span className="ml-2 text-sm font-normal text-muted">current</span>
            ) : null}
          </h2>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={policyPaths.version(org, doc.id, selected)}>
                <ExternalLinkIcon aria-hidden="true" /> Open full page
              </Link>
            </Button>
            {canRestore && selected !== doc.currentVersion ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirm(selected)}>
                <RotateCcwIcon aria-hidden="true" /> Restore as new version
              </Button>
            ) : null}
          </div>
        </div>
        <VersionCompare
          doc={doc}
          version={selected}
          mode={mode}
          diffMode={diffMode}
          onModeChange={(m) => setParam({ show: m === 'full' ? 'full' : null })}
          onDiffModeChange={(m) => setParam({ diff: m === 'split' ? 'split' : null })}
        />
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => (o ? null : setConfirm(null))}
        title={`Restore v${confirm ?? ''} as v${doc.currentVersion + 1}`}
        description={
          doc.requiresApproval
            ? `This copies the text of v${confirm ?? ''} into a new draft, v${doc.currentVersion + 1}. Nothing is lost: every version stays in the history.${doc.approvedVersion ? ` v${doc.approvedVersion} stays the approved version until the new draft is approved.` : ''}`
            : `This copies the text of v${confirm ?? ''} into a new version, v${doc.currentVersion + 1}, and publishes it.`
        }
        confirmLabel={`Restore as v${doc.currentVersion + 1}`}
        pending={restore.isPending}
        onConfirm={() => {
          if (confirm === null) return
          restore.mutate(
            { version: confirm, ifVersion: doc.version },
            {
              onSuccess: (d) => {
                toast.success(`Restored v${confirm} as v${d.currentVersion}`)
                setConfirm(null)
                router.replace(policyPaths.view(org, doc.id), { scroll: false })
              },
              onError: (e) => toastError(e),
            },
          )
        }}
      />
    </div>
  )
}
