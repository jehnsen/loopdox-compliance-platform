'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { GlobeIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useDeleteProcessing, useProcessingActivity } from '@/lib/api/hooks/use-privacy'
import type { ProcessingActivitySummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { LEGAL_BASIS_LABELS, RECIPIENT_KIND_LABELS } from '@/lib/privacy'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ActivityFeed } from '@/components/activity-feed'
import { ConfirmDialog } from '@/components/confirm-dialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { privacyPaths } from '@/features/privacy/paths'
import { ProcessingForm } from '@/features/privacy/processing-form'
import {
  DetailSkeleton,
  detailFallback,
  Field,
  privacyCrumbs,
  SensitiveChip,
  WarningChip,
} from '@/features/privacy/shared'

function Warnings({ p }: { p: ProcessingActivitySummary }) {
  const org = useOrgSlug()
  const can = useCan()
  const edit = can('privacy.edit')
  if (!p.warnings.length) return null
  return (
    <ul
      className="flex flex-col gap-2 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3"
      aria-label="Needs attention"
    >
      {p.warnings.map((w) => (
        <li key={w} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {w === 'no_pia' ? (
            <>
              <WarningChip className="bg-surface">No PIA</WarningChip>
              <span className="flex-1 text-base">
                No privacy impact assessment covers this activity.
              </span>
              {edit ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={privacyPaths.piaNew(org, p.id)}>Start a PIA</Link>
                </Button>
              ) : null}
            </>
          ) : w === 'no_agreement' ? (
            <>
              <WarningChip className="bg-surface">No agreement for recipient</WarningChip>
              <span className="flex-1 text-base">
                No linked agreement with {p.recipientsWithoutAgreement.join(', ')}.
              </span>
              {edit ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={privacyPaths.agreementNew(org, p.id)}>Add an agreement</Link>
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <WarningChip className="bg-surface">Retention not set</WarningChip>
              <span className="flex-1 text-base">Say how long this data is kept.</span>
              {edit ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={privacyPaths.processingEdit(org, p.id)}>Set retention</Link>
                </Button>
              ) : null}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

export function ProcessingPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const query = useProcessingActivity(org, id)
  const del = useDeleteProcessing(org, id)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fallback = detailFallback(query, privacyPaths.processing(org))
  if (fallback || !query.data) return fallback
  const p = query.data
  const edit = can('privacy.edit')

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={p.name}
        id={p.ref}
        status={
          <>
            <StatusPill status={p.status} />
            {p.hasSensitive ? <SensitiveChip /> : null}
          </>
        }
        breadcrumbs={privacyCrumbs(
          { label: 'Processing records', href: privacyPaths.processing(org) },
          { label: p.ref },
        )}
        className="pb-0"
        actions={
          edit ? (
            <>
              <Button asChild variant="primary">
                <Link href={privacyPaths.processingEdit(org, p.id)}>
                  <PencilIcon aria-hidden="true" /> Edit
                </Link>
              </Button>
              {p.status === 'draft' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="icon" aria-label="More actions">
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem variant="danger" onSelect={() => setConfirmDelete(true)}>
                      <Trash2Icon /> Delete draft
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </>
          ) : null
        }
      />
      <Warnings p={p} />
      <MetadataStrip
        items={[
          { label: 'Status', value: <StatusPill status={p.status} /> },
          { label: 'Legal basis', value: LEGAL_BASIS_LABELS[p.legalBasis] },
          { label: 'Owner', value: p.ownerName },
          { label: 'Retention', value: p.retention ?? <span className="text-muted">Not set</span> },
          {
            label: 'Cross-border',
            value: p.crossBorder.transfers ? p.crossBorder.countries.join(', ') : 'No',
          },
          {
            label: 'PIA',
            value: p.piaId ? (
              <Link
                href={privacyPaths.piaView(org, p.piaId)}
                className="inline-flex items-center gap-1.5 hover:underline"
              >
                <span className="font-mono text-sm">{p.piaRef}</span>
                {p.piaStatus ? <StatusPill status={p.piaStatus} /> : null}
              </Link>
            ) : (
              <span className="text-muted">None</span>
            ),
          },
        ]}
      />

      <Tabs defaultValue="details">
        <TabsList aria-label="Processing record sections">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <Card>
              <CardContent>
                <dl className="flex flex-col gap-5">
                  <Field label="Purpose">
                    <p className="max-w-reading whitespace-pre-line">{p.purpose}</p>
                  </Field>
                  <Field label="Data subjects">
                    <ul className="flex flex-wrap gap-1.5">
                      {p.dataSubjects.map((s) => (
                        <li key={s} className="rounded-md bg-surface-2 px-2 py-0.5 text-sm">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </Field>
                  <Field label="Data categories">
                    <ul className="flex flex-col gap-1" data-testid="data-categories">
                      {p.dataCategories.map((c) => (
                        <li
                          key={c.name}
                          className={
                            c.sensitive
                              ? 'flex flex-wrap items-center gap-2 rounded-md border-l-4 border-l-bad bg-bad-soft px-2 py-1'
                              : 'flex items-center gap-2 px-2 py-1'
                          }
                        >
                          <span>{c.name}</span>
                          {c.sensitive ? <SensitiveChip className="bg-surface" /> : null}
                        </li>
                      ))}
                    </ul>
                  </Field>
                  <Field label="Sources">
                    {p.sources || <span className="text-muted">Not recorded</span>}
                  </Field>
                  <Field label="Recipients">
                    {p.recipients.length ? (
                      <ul className="flex flex-col gap-1">
                        {p.recipients.map((r) => (
                          <li key={r.name} className="flex flex-wrap items-center gap-2">
                            <span>{r.name}</span>
                            <span className="text-sm text-muted">
                              {RECIPIENT_KIND_LABELS[r.kind]}
                            </span>
                            {p.recipientsWithoutAgreement.includes(r.name) ? (
                              <WarningChip>No agreement</WarningChip>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted">None recorded</span>
                    )}
                  </Field>
                  <Field label="Cross-border transfers">
                    {p.crossBorder.transfers ? (
                      <span className="inline-flex items-center gap-1.5">
                        <GlobeIcon className="size-4 text-muted" aria-hidden="true" />
                        {p.crossBorder.countries.join(', ')}
                      </span>
                    ) : (
                      'None'
                    )}
                  </Field>
                </dl>
              </CardContent>
            </Card>
            <LinkedRecords
              type="processing_activity"
              id={p.id}
              createLinks={
                edit
                  ? [
                      { label: 'Impact assessment', href: privacyPaths.piaNew(org, p.id) },
                      { label: 'Agreement', href: privacyPaths.agreementNew(org, p.id) },
                      { label: 'Data subject request', href: privacyPaths.requestNew(org, p.id) },
                    ]
                  : []
              }
            />
          </div>
        </TabsContent>
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed targetType="processing_activity" targetId={p.id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${p.ref}?`}
        description="This draft and its links are removed. This can’t be undone."
        confirmLabel={`Delete ${p.ref}`}
        destructive
        typedConfirmation={p.ref}
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Deleted ${p.ref}`)
              router.push(privacyPaths.processing(org))
            },
            onError: (e) => toastError(e),
          })
        }
      />
    </div>
  )
}

export function EditProcessingPage({ id }: { id: string }) {
  const org = useOrgSlug()
  // Always start from the latest saved version so `ifVersion` is current.
  const query = useProcessingActivity(org, id, true)
  if (query.isFetching && !query.isFetchedAfterMount) return <DetailSkeleton />
  const fallback = detailFallback(query, privacyPaths.processing(org))
  if (fallback || !query.data) return fallback
  return <ProcessingForm key={query.data.id} record={query.data} />
}
