import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line bg-surface-2 px-1 font-mono text-2xs font-medium text-muted',
        className,
      )}
      {...props}
    />
  )
}
