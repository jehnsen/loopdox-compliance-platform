'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { MoreHorizontalIcon, PencilIcon, Trash2Icon, UserCheckIcon } from 'lucide-react'
import { useDeleteSystem, useSystem } from '@/lib/api/hooks/use-security'
import { useCan } from '@/lib/auth/can'
import { SYSTEM_TYPE_LABELS } from '@/lib/security'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ActivityFeed } from '@/components/activity-feed'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useClassificationLabel } from '@/components/form/classification-select'
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
import { securityPaths } from '@/features/security/paths'
import { DetailSkeleton, recordFallback, securityCrumbs } from '@/features/security/shared'
import { SystemForm } from '@/features/security/system-form'

export function SystemPage({ id }: { id: string }) {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const query = useSystem(org, id)
  const del = useDeleteSystem(org, id)
  const classLabel = useClassificationLabel()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fallback = recordFallback(query, securityPaths.systems(org))
  if (fallback || !query.data) return fallback
  const s = query.data
  const edit = can('security.edit')

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={s.name}
        id={s.ref}
        description={`${SYSTEM_TYPE_LABELS[s.type]} · ${s.provider}`}
        breadcrumbs={securityCrumbs(
          { label: 'Systems', href: securityPaths.systems(org) },
          { label: s.ref },
        )}
        className="pb-0"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={securityPaths.access(org, { system: s.id })}>
                <UserCheckIcon aria-hidden="true" /> Who has access ({s.grantCount})
              </Link>
            </Button>
            {edit ? (
              <>
                <Button asChild variant="primary">
                  <Link href={securityPaths.systemEdit(org, s.id)}>
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
                      <Trash2Icon /> Delete system
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </>
        }
      />
      <MetadataStrip
        items={[
          { label: 'Type', value: SYSTEM_TYPE_LABELS[s.type] },
          { label: 'Provider', value: s.provider },
          { label: 'Owner', value: s.ownerName },
          { label: 'Classification', value: classLabel(s.classification) },
          { label: 'Hosting', value: s.hosting || null },
          { label: 'Personal data', value: s.holdsPersonalData ? 'Holds personal data' : 'None' },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {s.notes ? (
                <p className="whitespace-pre-line">{s.notes}</p>
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
              <ActivityFeed targetType="system" targetId={s.id} />
            </CardContent>
          </Card>
        </div>
        <LinkedRecords type="system" id={s.id} title="Linked records" />
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${s.ref}?`}
        description="A system that still has access grants, secrets, changes, decisions or linked records can’t be deleted. This can’t be undone."
        confirmLabel={`Delete ${s.ref}`}
        destructive
        typedConfirmation={s.ref}
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Deleted ${s.ref}`)
              router.push(securityPaths.systems(org))
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

export function EditSystemPage({ id }: { id: string }) {
  const org = useOrgSlug()
  // Always start from the latest saved version so `ifVersion` is current.
  const query = useSystem(org, id, true)
  if (query.isFetching && !query.isFetchedAfterMount) return <DetailSkeleton />
  const fallback = recordFallback(query, securityPaths.systems(org))
  if (fallback || !query.data) return fallback
  return <SystemForm key={query.data.id} record={query.data} />
}
