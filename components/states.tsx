'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlertCircleIcon, InboxIcon, LockIcon, SearchXIcon, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { en } from '@/lib/i18n/en'
import { Button } from '@/components/ui/button'

function StateFrame({
  icon: Icon,
  title,
  body,
  actions,
  tone = 'neutral',
  className,
  role,
}: {
  icon: LucideIcon
  title: ReactNode
  body?: ReactNode
  actions?: ReactNode
  tone?: 'neutral' | 'bad'
  className?: string
  role?: 'alert' | 'status'
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-full',
          tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-surface-2 text-muted',
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <h2 className="text-md font-semibold">{title}</h2>
        {body ? <p className="text-base text-muted">{body}</p> : null}
      </div>
      {actions ? <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Explains what goes here and offers the first action. */
export function EmptyState({
  title,
  body,
  actions,
  icon = InboxIcon,
  className,
}: {
  title: ReactNode
  body?: ReactNode
  actions?: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <StateFrame icon={icon} title={title} body={body} actions={actions} className={className} />
  )
}

/** Says what failed and how to retry. */
export function ErrorState({
  title = en.states.errorTitle,
  body = en.states.errorBody,
  onRetry,
  className,
}: {
  title?: ReactNode
  body?: ReactNode
  onRetry?: () => void
  className?: string
}) {
  return (
    <StateFrame
      role="alert"
      tone="bad"
      icon={AlertCircleIcon}
      title={title}
      body={body}
      className={className}
      actions={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {en.states.retry}
          </Button>
        ) : null
      }
    />
  )
}

export function NotFoundState({ homeHref, className }: { homeHref: string; className?: string }) {
  return (
    <StateFrame
      icon={SearchXIcon}
      title={en.states.notFoundTitle}
      body={en.states.notFoundBody}
      className={className}
      actions={
        <Button asChild variant="secondary">
          <Link href={homeHref}>{en.states.goToOverview}</Link>
        </Button>
      }
    />
  )
}

/** 403: explains the missing permission. */
export function ForbiddenState({
  permissionLabel,
  homeHref,
  className,
}: {
  permissionLabel: string
  homeHref?: string
  className?: string
}) {
  return (
    <StateFrame
      icon={LockIcon}
      title={en.states.forbiddenTitle}
      body={en.states.forbiddenBody(permissionLabel)}
      className={className}
      actions={
        homeHref ? (
          <Button asChild variant="secondary">
            <Link href={homeHref}>{en.states.goToOverview}</Link>
          </Button>
        ) : null
      }
    />
  )
}
