'use client'

import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDownIcon, CornerDownRightIcon, Link2Icon, PlusIcon, XIcon } from 'lucide-react'
import { useAddLink, useLinks, useRemoveLink } from '@/lib/api/hooks/use-privacy'
import type { LinkGroup, LinkedRecord, RecordType } from '@/lib/api/types'
import { RECORD_LABELS } from '@/lib/links'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { RecordSearchList } from '@/components/form/record-picker'
import { ErrorState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

export interface CreateLinkedAction {
  label: string
  href: string
}

function LinkedItem({
  item,
  removable,
  onRemove,
}: {
  item: LinkedRecord
  removable: boolean
  onRemove: () => void
}) {
  return (
    <li className="flex min-h-9 items-start gap-2 border-b border-line py-1.5 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-start gap-2">
          {item.ref ? <IdChip className="mt-px">{item.ref}</IdChip> : null}
          <Link href={item.href} className="min-w-0 hover:text-accent hover:underline">
            {item.title}
          </Link>
        </span>
        {item.status || item.direction === 'from' ? (
          <span className="flex flex-wrap items-center gap-2">
            {item.status ? <StatusPill status={item.status} /> : null}
            {item.direction === 'from' ? (
              <span
                className="inline-flex items-center gap-1 text-xs text-muted"
                title="That record links to this one"
              >
                <CornerDownRightIcon className="size-3" aria-hidden="true" /> links here
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      {removable ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Unlink ${item.ref ?? item.title}`}
        >
          <XIcon />
        </Button>
      ) : null}
    </li>
  )
}

/**
 * The records this one links to and from, grouped by type, with "Link existing"
 * and "Create linked" actions (section 8). Groups come from the server, which
 * knows the relations, the plan and the caller's permissions.
 */
export function LinkedRecords({
  type,
  id,
  createLinks = [],
  readOnly = false,
  title = 'Linked records',
  only,
}: {
  type: RecordType
  id: string
  createLinks?: CreateLinkedAction[]
  /** Hide link and unlink actions (e.g. a closed record). */
  readOnly?: boolean
  title?: string
  /** Show only these groups, in this order. */
  only?: RecordType[]
}) {
  const org = useOrgSlug()
  const { data, isLoading, isError, refetch } = useLinks(org, type, id)
  const add = useAddLink(org)
  const remove = useRemoveLink(org)
  const [dialogType, setDialogType] = useState<RecordType | null>(null)
  const self = { type, id }

  const groups: LinkGroup[] = only
    ? only.flatMap((t) => data?.groups.find((g) => g.type === t) ?? [])
    : (data?.groups ?? [])
  const linkable = readOnly ? [] : groups.filter((g) => g.linkable)

  const unlink = (item: LinkedRecord) =>
    remove.mutate(
      { from: self, to: { type: item.type, id: item.id } },
      {
        onSuccess: () => toast.success(`Unlinked ${item.ref ?? item.title}`),
        onError: (e) => toastError(e, 'Couldn’t unlink. Try again.'),
      },
    )

  return (
    <Card data-testid="linked-records">
      <CardHeader className="flex-wrap">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex flex-wrap gap-2">
          {linkable.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Link2Icon aria-hidden="true" /> Link existing
                  <ChevronDownIcon className="text-muted" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {linkable.map((g) => (
                  <DropdownMenuItem key={g.type} onSelect={() => setDialogType(g.type)}>
                    {RECORD_LABELS[g.type].one}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {createLinks.length && !readOnly ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <PlusIcon aria-hidden="true" /> Create linked
                  <ChevronDownIcon className="text-muted" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {createLinks.map((c) => (
                  <DropdownMenuItem key={c.href} asChild>
                    <Link href={c.href}>{c.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState title="Couldn’t load linked records" onRetry={() => void refetch()} />
        ) : (
          groups.map((g) => (
            <section
              key={g.type}
              aria-labelledby={`links-${g.type}`}
              className="flex flex-col gap-1"
            >
              <h3 id={`links-${g.type}`} className="label-caps flex items-center gap-2">
                {g.label}
                <span className="font-normal tracking-normal text-muted normal-case tabular-nums">
                  {g.items.length}
                </span>
              </h3>
              {g.items.length ? (
                <ul>
                  {g.items.map((item) => (
                    <LinkedItem
                      key={item.id}
                      item={item}
                      removable={g.linkable && !readOnly}
                      onRemove={() => unlink(item)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">None linked.</p>
              )}
            </section>
          ))
        )}
      </CardContent>

      <Dialog open={dialogType !== null} onOpenChange={(o) => !o && setDialogType(null)}>
        <DialogContent className="max-w-md gap-3 p-0 pt-5">
          <DialogHeader className="px-5">
            <DialogTitle>
              Link {dialogType ? RECORD_LABELS[dialogType].one.toLowerCase() : 'record'}
            </DialogTitle>
            <DialogDescription>Choose a record to link to this one.</DialogDescription>
          </DialogHeader>
          {dialogType ? (
            <div className="border-t border-line">
              <RecordSearchList
                type={dialogType}
                forRecord={self}
                autoFocus
                onSelect={(r) =>
                  add.mutate(
                    { from: self, to: { type: r.type, id: r.id } },
                    {
                      onSuccess: () => {
                        toast.success(`Linked ${r.ref ?? r.title}`)
                        setDialogType(null)
                      },
                      onError: (e) => toastError(e, 'Couldn’t link. Try again.'),
                    },
                  )
                }
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
