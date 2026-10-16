import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface MetadataItem {
  label: string
  value: ReactNode
  /** Optional glyph beside the label. */
  icon?: LucideIcon
}

/**
 * Label/value grid used on every record detail page. When the items fit on one
 * row at desktop width, hairline dividers separate the columns.
 */
export function MetadataStrip({ items, className }: { items: MetadataItem[]; className?: string }) {
  const oneRow = items.length <= 6
  return (
    <dl
      className={cn(
        'grid grid-cols-2 rounded-lg border border-line bg-surface sm:grid-cols-3 lg:grid-cols-6',
        oneRow && 'lg:[&>div+div]:border-l lg:[&>div+div]:border-line',
        className,
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-col gap-1.5 px-4 py-3.5">
          <dt className="label-caps flex items-center gap-1.5">
            {it.icon ? <it.icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            {it.label}
          </dt>
          <dd className="truncate text-base text-fg">
            {it.value ?? <span className="text-muted">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
