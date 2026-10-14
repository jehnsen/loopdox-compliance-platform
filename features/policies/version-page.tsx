'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { HistoryIcon, RotateCcwIcon } from 'lucide-react'
import { useDocument, useDocumentVersion, useRestoreVersion } from '@/lib/api/hooks/use-documents'
import { isApiError } from '@/lib/api/client'
import { useCan } from '@/lib/auth/can'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateText } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { ErrorState, NotFoundState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AcknowledgeCard } from '@/features/policies/acknowledge-card'
import { versionTypeLabel, VersionCompare } from '@/features/policies/history-tab'
import { policyPaths } from '@/features/policies/paths'
import { Banner } from '@/features/policies/policy-page'

/** One version of a policy, read-only: full text or changes from the previous version. */
export function VersionPage({ id, version }: { id: string; version: number }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const doc = useDocument(org, id)
  const v = useDocumentVersion(org, doc.data?.id ?? id, version)
  const restore = useRestoreVersion(org, doc.data?.id ?? id)
  const [confirm, setConfirm] = useState(false)

  if (doc.isLoading || v.isLoading) return <Skeleton className="h-96" />
  if (doc.isError || v.isError || !doc.data || !v.data) {
    const e = doc.error ?? v.error
    if (isApiError(e) && e.isNotFound) return <NotFoundState homeHref={policyPaths.library(org)} />
    return <ErrorState onRetry={() => void (doc.refetch(), v.refetch())} />
  }
  const d = doc.data
  const ver = v.data
  const mode = searchParams.get('show') === 'changes' ? 'changes' : 'full'
  const diffMode = searchParams.get('diff') === 'split' ? 'split' : 'unified'
  const setParam = (k: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString())
    if (value) next.set(k, value)
    else next.delete(k)
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false })
  }
  const isApproved = version === d.approvedVersion
  const isCurrent = version === d.currentVersion

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={ver.title}
        id={d.docId}
        version={version}
        status={isApproved ? <StatusPill status="approved" label="Approved version" /> : null}
        breadcrumbs={[
          { label: 'Policies', href: policyPaths.library(org) },
          { label: d.docId, href: policyPaths.view(org, d.id) },
          {
            label: 'History',
            href: policyPaths.view(org, d.id, 'history', { v: String(version) }),
          },
          { label: `v${version}` },
        ]}
        description={
          <>
            {versionTypeLabel(ver)} by {ver.authorName} <DateText value={ver.createdAt} relative />{' '}
            · “{ver.changeSummary}”
          </>
        }
        actions={
          can('policies.edit') && !isCurrent && d.status !== 'retired' ? (
            <Button variant="secondary" onClick={() => setConfirm(true)}>
              <RotateCcwIcon aria-hidden="true" /> Restore as new version
            </Button>
          ) : null
        }
        className="pb-0"
      />
      {!isCurrent ? (
        <Banner
          tone="info"
          icon={HistoryIcon}
          title={`You’re viewing v${version}, an earlier version`}
          actions={
            <Button asChild variant="secondary" size="sm">
              <Link href={policyPaths.view(org, d.id)}>Go to the current version</Link>
            </Button>
          }
        >
          The current version is v{d.currentVersion}
          {d.approvedVersion && d.approvedVersion !== d.currentVersion
            ? `, and v${d.approvedVersion} is approved`
            : ''}
          .
        </Banner>
      ) : null}
      <VersionCompare
        doc={d}
        version={version}
        mode={mode}
        diffMode={diffMode}
        onModeChange={(m) => setParam('show', m === 'changes' ? 'changes' : null)}
        onDiffModeChange={(m) => setParam('diff', m === 'split' ? 'split' : null)}
      />
      <AcknowledgeCard doc={d} viewingVersion={version} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Restore v${version} as v${d.currentVersion + 1}`}
        description={`This copies the text of v${version} into a new ${d.requiresApproval ? 'draft' : 'published version'}, v${d.currentVersion + 1}. Every version stays in the history.`}
        confirmLabel={`Restore as v${d.currentVersion + 1}`}
        pending={restore.isPending}
        onConfirm={() =>
          restore.mutate(
            { version, ifVersion: d.version },
            {
              onSuccess: (r) => {
                toast.success(`Restored v${version} as v${r.currentVersion}`)
                router.push(policyPaths.view(org, d.id))
              },
              onError: (e) => toastError(e),
            },
          )
        }
      />
    </div>
  )
}
