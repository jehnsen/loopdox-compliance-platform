import { cn } from '@/lib/utils/cn'

export interface BarSegment {
  key: string
  label: string
  value: number
  /** Tailwind background class for the fill. */
  className: string
}

/**
 * One horizontal bar split into segments. Segments keep a 2px gap, and the
 * legend (below, or per row) names every segment with its count, so status
 * never depends on colour alone.
 */
export function StackedBar({
  segments,
  label,
  className,
}: {
  segments: BarSegment[]
  /** Accessible summary, e.g. "12 of 16 approved". */
  label: string
  className?: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2',
        className,
      )}
    >
      {total
        ? segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span
                key={s.key}
                data-segment={s.key}
                className={cn('h-full first:rounded-l-full last:rounded-r-full', s.className)}
                style={{ flexGrow: s.value, flexBasis: 0 }}
              />
            ))
        : null}
    </div>
  )
}

/** Legend: a swatch, the label (text tokens, never the series colour) and the count. */
export function BarLegend({ segments, className }: { segments: BarSegment[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm', className)}>
      {segments.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('size-2.5 rounded-sm', s.className)} />
          <span className="text-muted">{s.label}</span>
          <span className="font-medium tabular-nums">{s.value}</span>
        </li>
      ))}
    </ul>
  )
}
