'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { MoreHorizontalIcon, PencilIcon, Repeat2Icon, Trash2Icon } from 'lucide-react'
import { useDecision, useDeleteDecision } from '@/lib/api/hooks/use-security'
import { useCan } from '@/lib/auth/can'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ActivityFeed } from '@/components/activity-feed'
import { IdChip } from '@/components/chips'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CalendarDate } from '@/components/date-text'
import { LinkedRecords } from '@/components/linked-records'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DecisionForm } from '@/features/security/decision-form'
import { securityPaths } from '@/features/security/paths'
import { DetailSkeleton, recordFallback, securityCrumbs } from '@/features/security/shared'

function Section({ title, children }: { title: string; children: string }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="label-caps">{title}</h2>
      <p className="max-w-[72ch] whitespace-pre-line">{children}</p>
    </section>
  )
}

export function DecisionPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const query = useDecision(org, id)
  const del = useDeleteDecision(org, id)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fallback = recordFallback(query, securityPaths.decisions(org))
  if (fallback || !query.data) return fallback
  const d = query.data
  const edit = can('security.edit')

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={d.title}
        id={d.ref}
        status={<StatusPill status={d.status} />}
        breadcrumbs={securityCrumbs(
          { label: 'Decisions', href: securityPaths.decisions(org) },
          { label: d.ref },
        )}
        className="pb-0"
        actions={
          edit ? (
            <>
              {d.status === 'accepted' ? (
                <Button asChild variant="secondary">
                  <Link href={securityPaths.decisionNew(org, d.id)}>
                    <Repeat2Icon aria-hidden="true" /> Supersede
                  </Link>
                </Button>
              ) : null}
              {d.status !== 'superseded' ? (
                <Button asChild variant="primary">
                  <Link href={securityPaths.decisionEdit(org, d.id)}>
                    <PencilIcon aria-hidden="true" /> Edit
                  </Link>
                </Button>
              ) : null}
              {d.status === 'proposed' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="icon" aria-label="More actions">
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem variant="danger" onSelect={() => setConfirmDelete(true)}>
                      <Trash2Icon /> Delete proposal
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </>
          ) : null
        }
      />
      {d.status === 'superseded' && d.supersededBy ? (
        <p
          role="status"
          data-testid="superseded-banner"
          className="rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-base"
        >
          This decision was superseded by{' '}
          <Link
            href={securityPaths.decisionView(org, d.supersededBy)}
            className="font-medium underline"
          >
            {d.supersededByRef}
          </Link>
          . It stays here as a record of what was decided at the time.
        </p>
      ) : null}
      <MetadataStrip
        items={[
          {
            label: 'Status',
            value:
              d.status === 'proposed'
                ? 'Proposed'
                : d.status === 'accepted'
                  ? 'Accepted'
                  : 'Superseded',
          },
          { label: 'Decided by', value: d.decidedByName },
          { label: 'Date', value: <CalendarDate value={d.decidedAt} /> },
          { label: 'Systems', value: String(d.systemIds.length) },
          {
            label: 'Replaces',
            value: d.supersedes ? (
              <Link
                href={securityPaths.decisionView(org, d.supersedes)}
                className="hover:text-accent hover:underline"
              >
                <IdChip>{d.supersedesRef}</IdChip>
              </Link>
            ) : null,
          },
          {
            label: 'Replaced by',
            value: d.supersededBy ? (
              <Link
                href={securityPaths.decisionView(org, d.supersededBy)}
                className="hover:text-accent hover:underline"
              >
                <IdChip>{d.supersededByRef}</IdChip>
              </Link>
            ) : null,
          },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-6 pt-4">
              <Section title="Context">{d.context}</Section>
              <Section title="Decision">{d.decision}</Section>
              <Section title="Consequences">{d.consequences}</Section>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed targetType="decision" targetId={d.id} />
            </CardContent>
          </Card>
        </div>
        <LinkedRecords type="decision" id={d.id} readOnly={d.status === 'superseded'} />
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${d.ref}?`}
        description="Only proposals can be deleted. Accepted decisions are the record: supersede them instead. This can’t be undone."
        confirmLabel={`Delete ${d.ref}`}
        destructive
        typedConfirmation={d.ref}
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Deleted ${d.ref}`)
              router.push(securityPaths.decisions(org))
            },
            onError: (e) => {
              setConfirmDelete(false)
              toastError(e)
            },
          })
        }
      />
    </div>
  )
}

export function EditDecisionPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const query = useDecision(org, id, true)
  if (query.isFetching && !query.isFetchedAfterMount) return <DetailSkeleton />
  const fallback = recordFallback(query, securityPaths.decisions(org))
  if (fallback || !query.data) return fallback
  return <DecisionForm key={query.data.id} record={query.data} />
}

/** /decisions/new, or /decisions/new?supersedes=ADR-001 to replace an accepted decision. */
export function NewDecisionPage() {
  const org = useOrgSlug()
  const supersedesId = useSearchParams().get('supersedes') ?? ''
  const old = useDecision(org, supersedesId, true)
  if (!supersedesId) return <DecisionForm />
  if (old.isFetching && !old.isFetchedAfterMount) return <DetailSkeleton />
  const fallback = recordFallback(old, securityPaths.decisions(org))
  if (fallback || !old.data) return fallback
  return <DecisionForm key={old.data.id} supersedes={old.data} />
}
