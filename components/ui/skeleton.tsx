import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-2', className)}
      {...props}
    />
  )
}
