'use client'

import * as React from 'react'
import { Progress as ProgressPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils/cn'

export function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={pct}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full bg-accent transition-[width]', indicatorClassName)}
        style={{ width: `${pct}%` }}
      />
    </ProgressPrimitive.Root>
  )
}
