import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export interface MetadataItem {
  label: string
  value: ReactNode
}

/** Label/value grid used on every record detail page. */
export function MetadataStrip({ items, className }: { items: MetadataItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-line bg-surface px-4 py-3 lg:grid-cols-6 sm:grid-cols-3',
        className,
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-col gap-1">
          <dt className="label-caps">{it.label}</dt>
          <dd className="truncate text-base text-fg">
            {it.value ?? <span className="text-muted">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
