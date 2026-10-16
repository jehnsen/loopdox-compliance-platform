'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useAgreement, useDeleteAgreement } from '@/lib/api/hooks/use-privacy'
import { useCan } from '@/lib/auth/can'
import { AGREEMENT_ROLE_LABELS, AGREEMENT_TYPE_LABELS } from '@/lib/privacy'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ActivityFeed } from '@/components/activity-feed'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CalendarDate } from '@/components/date-text'
import { FileLink } from '@/components/file-dropzone'
import { LinkedRecords } from '@/components/linked-records'
import { MetadataStrip } from '@/components/metadata-strip'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AgreementForm } from '@/features/privacy/agreement-form'
import { privacyPaths } from '@/features/privacy/paths'
import { DetailSkeleton, detailFallback, DuePill, privacyCrumbs } from '@/features/privacy/shared'

export function AgreementPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const query = useAgreement(org, id)
  const del = useDeleteAgreement(org, id)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fallback = detailFallback(query, privacyPaths.agreements(org))
  if (fallback || !query.data) return fallback
  const a = query.data
  const edit = can('privacy.edit')

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={a.counterparty}
        id={a.ref}
        status={<DuePill state={a.renewalState} days={a.daysToRenewal} verb="Renews" />}
        description={AGREEMENT_TYPE_LABELS[a.type]}
        breadcrumbs={privacyCrumbs(
          { label: 'Agreements', href: privacyPaths.agreements(org) },
          { label: a.ref },
        )}
        className="pb-0"
        actions={
          edit ? (
            <>
              <Button asChild variant="primary">
                <Link href={privacyPaths.agreementEdit(org, a.id)}>
                  <PencilIcon aria-hidden="true" /> Edit
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="More actions">
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="danger" onSelect={() => setConfirmDelete(true)}>
                    <Trash2Icon /> Delete agreement
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null
        }
      />
      <MetadataStrip
        items={[
          { label: 'Type', value: AGREEMENT_TYPE_LABELS[a.type] },
          { label: 'Our role', value: AGREEMENT_ROLE_LABELS[a.role] },
          { label: 'Signed', value: <CalendarDate value={a.signedAt} /> },
          {
            label: 'Renews',
            value: a.renewsAt ? <CalendarDate value={a.renewsAt} /> : 'No fixed term',
          },
          { label: 'Owner', value: a.ownerName },
          {
            label: 'Signed copy',
            value: a.file ? (
              <FileLink file={a.file} />
            ) : (
              <span className="text-muted">Not attached</span>
            ),
          },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {a.notes ? (
                <p className="whitespace-pre-line">{a.notes}</p>
              ) : (
                <p className="text-muted">No notes.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed targetType="agreement" targetId={a.id} />
            </CardContent>
          </Card>
        </div>
        <LinkedRecords type="agreement" id={a.id} />
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${a.ref}?`}
        description="The agreement is removed and unlinked from its processing records. This can’t be undone."
        confirmLabel={`Delete ${a.ref}`}
        destructive
        typedConfirmation={a.ref}
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Deleted ${a.ref}`)
              router.push(privacyPaths.agreements(org))
            },
            onError: (e) => toastError(e),
          })
        }
      />
    </div>
  )
}

export function EditAgreementPage({ id }: { id: string }) {
  const org = useOrgSlug()
  // Always start from the latest saved version so `ifVersion` is current.
  const query = useAgreement(org, id, true)
  if (query.isFetching && !query.isFetchedAfterMount) return <DetailSkeleton />
  const fallback = detailFallback(query, privacyPaths.agreements(org))
  if (fallback || !query.data) return fallback
  return <AgreementForm key={query.data.id} record={query.data} />
}
