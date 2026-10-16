import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronRightIcon, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { IdChip, VersionChip } from '@/components/chips'

export interface Crumb {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items.length) return null
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRightIcon className="size-3.5" aria-hidden="true" /> : null}
            {c.href ? (
              <Link href={c.href} className="hover:text-fg hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function PageHeader({
  title,
  breadcrumbs = [],
  id,
  version,
  status,
  description,
  actions,
  icon: Icon,
  className,
}: {
  title: ReactNode
  breadcrumbs?: Crumb[]
  /** Record ID shown as a mono chip. */
  id?: string
  version?: number
  status?: ReactNode
  description?: ReactNode
  /** Primary action last; it sits rightmost. */
  actions?: ReactNode
  /** Record-type tile shown beside the title on wider screens. */
  icon?: LucideIcon
  className?: string
}) {
  return (
    <header className={cn('flex flex-col gap-2.5 pb-6', className)}>
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-4">
          {Icon ? (
            <span
              aria-hidden="true"
              className="mt-0.5 hidden size-12 shrink-0 items-center justify-center rounded-lg border border-accent/15 bg-accent-soft text-accent sm:flex"
            >
              <Icon className="size-5.5" strokeWidth={1.75} />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {id ? <IdChip>{id}</IdChip> : null}
              {version !== undefined ? <VersionChip version={version} /> : null}
              {status}
            </div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-[26px] sm:leading-8">
              {title}
            </h1>
            {description ? (
              <p className="max-w-reading text-base text-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
