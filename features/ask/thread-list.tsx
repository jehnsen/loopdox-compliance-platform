'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { MoreHorizontalIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useAskThreads, useDeleteAskThread } from '@/lib/api/hooks/use-ask'
import { cn } from '@/lib/utils/cn'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateText } from '@/components/date-text'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

/** The signed-in user's conversations, newest first. Conversations are private to them. */
export function ThreadList({
  activeId,
  onSelect,
  onNew,
}: {
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}) {
  const org = useOrgSlug()
  const threads = useAskThreads(org)
  const remove = useDeleteAskThread(org)
  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(null)

  return (
    <nav aria-label="Conversations" className="flex min-h-0 flex-col gap-2">
      <Button variant="secondary" onClick={onNew} className="justify-start">
        <PlusIcon aria-hidden="true" /> New conversation
      </Button>
      {threads.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : threads.data?.length ? (
        <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {threads.data.map((t) => (
            <li key={t.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                aria-current={t.id === activeId ? 'page' : undefined}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-md py-1.5 pr-8 pl-2 text-left hover:bg-surface-2',
                  t.id === activeId && 'bg-accent-soft hover:bg-accent-soft',
                )}
              >
                <span className="line-clamp-2 text-sm">{t.title}</span>
                <DateText value={t.updatedAt} relative className="text-xs text-muted" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="absolute top-1.5 right-1 inline-flex size-6 items-center justify-center rounded-sm text-muted opacity-0 group-hover:opacity-100 hover:bg-surface focus-visible:opacity-100 data-[state=open]:opacity-100"
                  aria-label={`Options for “${t.title}”`}
                >
                  <MoreHorizontalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="danger"
                    onSelect={() => setConfirm({ id: t.id, title: t.title })}
                  >
                    <Trash2Icon /> Delete conversation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 text-sm text-muted">
          Your conversations appear here. Only you can see them.
        </p>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => (o ? null : setConfirm(null))}
        title="Delete this conversation?"
        description={`“${confirm?.title ?? ''}” and its answers will be deleted. This can’t be undone.`}
        confirmLabel="Delete conversation"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (!confirm) return
          remove.mutate(confirm.id, {
            onSuccess: () => {
              toast.success('Conversation deleted')
              if (confirm.id === activeId) onNew()
              setConfirm(null)
            },
            onError: (e) => toastError(e),
          })
        }}
      />
    </nav>
  )
}
