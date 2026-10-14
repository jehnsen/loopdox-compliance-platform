import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-20 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-base text-fg placeholder:text-muted/80 focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-bad',
        className,
      )}
      {...props}
    />
  )
}
