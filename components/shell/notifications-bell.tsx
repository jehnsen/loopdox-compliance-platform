'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BellIcon } from 'lucide-react'
import { useMarkNotificationsRead, useNotifications } from '@/lib/api/hooks/use-notifications'
import { en } from '@/lib/i18n/en'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug } from '@/components/providers/session-provider'
import { DateText } from '@/components/date-text'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'

export function NotificationsBell() {
  const org = useOrgSlug()
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError, refetch } = useNotifications(org)
  const markRead = useMarkNotificationsRead(org)
  const unread = data?.unread ?? 0
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread ? `${en.shell.notifications} (${unread} unread)` : en.shell.notifications
          }
        >
          <BellIcon />
          {unread ? (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-2xs leading-none font-semibold text-surface tabular-nums">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,24rem)] p-0">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="text-base font-semibold">{en.shell.notifications}</h2>
          {unread ? (
            <Button
              variant="link"
              size="sm"
              onClick={() => markRead.mutate({ all: true })}
              disabled={markRead.isPending}
            >
              {en.shell.markAllRead}
            </Button>
          ) : null}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-start gap-2 p-3 text-base">
              <p>Couldn’t load notifications.</p>
              <Button size="sm" onClick={() => refetch()}>
                {en.states.retry}
              </Button>
            </div>
          ) : !data?.items.length ? (
            <p className="px-3 py-6 text-center text-base text-muted">{en.shell.noNotifications}</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate({ ids: [n.id] })
                      setOpen(false)
                    }}
                    className="flex gap-2.5 px-3 py-2.5 hover:bg-surface-2"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        n.readAt ? 'border border-line' : 'bg-accent',
                      )}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cn('text-base', !n.readAt && 'font-medium')}>
                        {n.readAt ? null : <span className="sr-only">Unread: </span>}
                        {n.title}
                      </span>
                      <span className="text-sm text-muted">{n.body}</span>
                      <DateText value={n.at} relative className="text-xs text-muted" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
